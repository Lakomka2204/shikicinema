import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { HttpHeaders, HttpParams } from '@angular/common/http';
import {
  catchError,
  concatMap,
  debounceTime,
  delay,
  distinctUntilChanged,
  map,
  shareReplay,
  switchMap,
  takeWhile,
  withLatestFrom,
} from 'rxjs/operators';
import {
  BehaviorSubject,
  combineLatest,
  EMPTY,
  firstValueFrom,
  from,
  iif,
  Observable,
  of,
  Subject,
} from 'rxjs';
import { MatDialog } from '@angular/material/dialog';

import { AboutDialogComponent } from '../../shared/components/about-dialog/about-dialog.component';
import { ShikivideosService } from '../../services/shikivideos-api/shikivideos.service';
import { ShikimoriService } from '../../services/shikimori-api/shikimori.service';
import { Shikimori } from '../../types/shikimori';
import { SmarthardNet } from '../../types/smarthard-net';
import { AuthService } from '../../services/auth/auth.service';
import { NotificationsService } from '../../services/notifications/notifications.service';
import { ShikicinemaSettings } from '../../types/ShikicinemaSettings';
import { SettingsService } from '../../services/settings/settings.service';
import { UserPreferencesService } from '../../services/user-preferences/user-preferences.service';
import { Notification, NotificationType } from '../../types/notification';
import { IRequestDialogData, RequestDialogComponent } from '../../shared/components/request-dialog/request-dialog.component';
import { KodikService } from '../../services/kodik-api/kodik.service';
import { RemoteNotificationsService } from '../../services/remote-notifications/remote-notifications.service';
import { CommentsService } from '../../services/comments/comments.service';

@Component({
  selector: 'app-player',
  templateUrl: './player.component.html',
  styleUrls: ['./player.component.css']
})
export class PlayerComponent implements OnInit, OnDestroy {

  constructor(
    private router: Router,
    private auth: AuthService,
    private route: ActivatedRoute,
    private notify: NotificationsService,
    private remoteNotifications: RemoteNotificationsService,
    private preferenses: UserPreferencesService,
    private videosApi: ShikivideosService,
    private kodikService: KodikService,
    private shikimori: ShikimoriService,
    private settingsService: SettingsService,
    readonly commentsService: CommentsService,
    private title: Title,
    private dialog: MatDialog
  ) {}

  private isAlive = true;

  public readonly EMPTY_VIDEO = new SmarthardNet.Shikivideo({ id: -666 });
  public filter = new SmarthardNet.VideoFilter();
  public isUploadOpened = false;
  public settings: ShikicinemaSettings;
  public urlParams: { animeId?: number, episode?: number } = {};
  public userRate: Shikimori.UserRate;
  public uploader: Shikimori.User;
  public currentVideo: SmarthardNet.Shikivideo;
  public isWaitingUserRates: boolean;

  readonly episodeSubject = new BehaviorSubject<number>(1);
  readonly quotesSubject = new Subject<string>();
  readonly repliesSubject = new Subject<string>();
  readonly uploaderSubject = new BehaviorSubject<string>(null);
  readonly isWaitingUserRatesSubject = new BehaviorSubject<boolean>(false);

  readonly animeId$ = this.route.params.pipe(
    map((params) => +params.animeId),
    distinctUntilChanged()
  );

  readonly anime$: Observable<Shikimori.Anime> = this.animeId$.pipe(
    switchMap(animeId => this.shikimori.getAnime(animeId)),
    shareReplay(1),
  );

  readonly episode$ = this.episodeSubject.pipe(
    distinctUntilChanged(),
    debounceTime(300),
    switchMap((episode) => episode !== 1
      ? of(episode)
      : this.route.params.pipe(
        map((params) => +params.episode || 1)
      )
    )
  );

  readonly shikivideos$ = combineLatest([this.anime$, this.episode$])
    .pipe(
      switchMap(([anime, episode]) => this.videosApi.findById(anime.id, new HttpParams()
        .set('limit', 'all')
        .set('episode', `${episode}`)
      )),
    );

  readonly kodikvideos$ = combineLatest([this.anime$, this.episode$])
    .pipe(
      distinctUntilChanged(([animeA, episodeA], [animeB, episodeB]) => animeA.id === animeB.id && episodeA === episodeB),
      delay(1000),
      switchMap(([anime, episode]) => from(this.kodikService.search(anime, episode))),
      shareReplay(1),
    );

  readonly videos$ = this.shikivideos$
    .pipe(
      (shikivideos$) => combineLatest([shikivideos$, this.kodikvideos$]),
      map(([shikivideos, kodikvideos]) => [
        ...shikivideos,
        ...kodikvideos.filter((kv) => !shikivideos.some((sv) => sv.url.endsWith(kv.url))),
      ]),
      map((videos: SmarthardNet.Shikivideo[]) => videos.sort((a, b) => `${a.author}`.localeCompare(`${b.author}`))),
      catchError(err => this._httpErrorHandler(err)),
      shareReplay(1),
    );

  readonly shikivideosUnique$: Observable<SmarthardNet.Unique> = this.animeId$.pipe(
    switchMap(animeId => this.videosApi.getUniqueValues(new HttpParams()
      .set('anime_id', `${animeId}`)
      .set('column', 'author+kind+language+url+quality')
      .set('limit', 'all')
    )),
    shareReplay(1),
  );

  readonly kodikUnique$ = this.kodikvideos$
    .pipe(
      withLatestFrom(this.anime$),
      switchMap(([_, anime]) => this.kodikService.getUnique(anime)),
    );

  readonly quotes$ = this.quotesSubject.asObservable();
  readonly replies$ = this.repliesSubject.asObservable();

  readonly unique$ = this.anime$
    .pipe(
      switchMap(() => this.shikivideosUnique$),
      (shikivideosUnique) => combineLatest([shikivideosUnique, this.kodikUnique$]),
      map((uniques: SmarthardNet.Unique[]) => SmarthardNet.mergeUniques(uniques))
    );

  readonly whoami$ = this.auth.whoami$;

  readonly userRate$ = this.anime$.pipe(
    map((anime) => anime.user_rate),
    catchError(() => of(null as Shikimori.UserRate)),
    shareReplay(1),
  );

  readonly isAnimeWatched$ = this.userRate$.pipe(
    map((anime) => anime?.status === 'completed' || anime?.status === 'rewatching'),
  );

  readonly notifications$ = this.remoteNotifications.notifications$;
  private _httpErrorHandler = (err) => {
    console.error(err);
    this.notify.add(new Notification(NotificationType.ERROR, 'Не удалось загрузить видео!', err));
    return of([] as SmarthardNet.Shikivideo[]);
  };

  ngOnDestroy(): void {
    this.isAlive = false;
  }

  ngOnInit() {
    this.settingsService.get()
      .subscribe(
      (data) => this.settings = new ShikicinemaSettings(data)
    );

    this.route.params
      .pipe(
        takeWhile(() => this.isAlive)
      )
      .subscribe(
      (params) => this.urlParams = {
        animeId: params.animeId,
        episode: params.episode
      }
    );

    this.episode$
      .pipe(
        takeWhile(() => this.isAlive),
        (episode$) => combineLatest([episode$, this.anime$])
      )
      .subscribe(([episode, anime]) => {
        const title = anime.russian || anime.name;
        this.commentsService.setAnime(anime);
        this.commentsService.setEpisode(episode);
        this.title.setTitle(`${title} - эпизод ${episode}`)
        this.EMPTY_VIDEO.episode = episode;
      });

    this.videos$
      .pipe(
        takeWhile(() => this.isAlive),
      )
      .subscribe(
        (videos) => {
        const query = this.route.snapshot.queryParams;
        const videoById = videos.filter((vid) => query && query.id && `${vid.id}` === `${query.id}`)[0];
        const favVideos = this._chooseFavourite(videos);

        this.changeVideo( videos.length === 0 ? this.EMPTY_VIDEO : (videoById ? videoById : favVideos[0]) );
      }
    );

    this.userRate$
      .pipe(
        takeWhile(() => this.isAlive),
      )
      .subscribe(
        userRates => this.userRate = new Shikimori.UserRate(userRates ? userRates : {})
    );

    this.uploaderSubject
      .pipe(
        takeWhile(() => this.isAlive),
        debounceTime(250),
        switchMap(uploader => iif(
          () => !!uploader,
          this.shikimori.getUserInfo(uploader)
            .pipe(catchError(() => null)),
          of(null)
        ))
      )
      .subscribe(
      uploader => this.uploader = uploader as Shikimori.User
    );

    this.isWaitingUserRatesSubject
      .pipe(
        takeWhile(() => this.isAlive),
        concatMap((isWaiting) => !isWaiting
          ? of(isWaiting).pipe(delay(1000))
          : of(isWaiting)
        ),
      )
      .subscribe((isWaiting) => this.isWaitingUserRates = isWaiting)
  }

  async changeEpisode(episode: number | string) {
    if (episode) {
      this.episodeSubject.next(+episode);
      await this.router.navigate([`../${episode}`], { relativeTo:  this.route });
    }
  }

  addQuote(quote: string) {
    this.quotesSubject.next(quote);
  }

  addReply(reply: string) {
    this.repliesSubject.next(reply);
  }

  changeVideo(video: SmarthardNet.Shikivideo) {
    const fav = new SmarthardNet.VideoFilter(video.author, null, null, video.url, video.quality);
    this.currentVideo = video;
    this.preferenses.set(+video.anime_id, fav);
    this.uploaderSubject.next(video.uploader);
  }

  async synchronize() {
    const token = await this.auth.shikimoriSync().toPromise();

    if (token) {
      setTimeout(() => window.location.reload(), 700);
    }
  }

  watched(episode: number): boolean {
    return this.userRate && this.userRate.episodes >= episode;
  }

  rewatched(episode: number): boolean {
    return this.userRate?.status === 'rewatching' && this.userRate.episodes >= episode;
  }

  async watch(anime: Shikimori.Anime, episode: number, user: Shikimori.User, message: string) {
    const animeEpisodes = anime.episodes || anime.episodes_aired;
    const userRate = new Shikimori.UserRate({
      user_id: user.id,
      target_id: anime.id,
      target_type: 'Anime',
      episodes: episode
    });

    this.isWaitingUserRatesSubject.next(true);

    if (this.userRate.id) {
      userRate.id = this.userRate.id;
      this.userRate = await this.shikimori.setUserRates(userRate).toPromise();
    } else {
      userRate.status = 'watching';
      this.userRate = await this.shikimori.createUserRates(userRate).toPromise();
    }

    if (animeEpisodes >= episode + 1) {
      await this.changeEpisode(episode + 1);
    }

    this.notify.add(new Notification(NotificationType.OK, message));
    this.isWaitingUserRatesSubject.next(false);
  }

  async rewatch(anime: Shikimori.Anime, episode: number, user: Shikimori.User, message: string) {
    const animeEpisodes = anime.episodes || anime.episodes_aired;
    const userRate = new Shikimori.UserRate({
      id: this.userRate.id,
      user_id: user.id,
      target_id: anime.id,
      target_type: 'Anime',
      status: 'rewatching',
      episodes: episode
    });
    this.isWaitingUserRatesSubject.next(true);
    const newUserRate = await this.shikimori.setUserRates(userRate).toPromise();

    // this will not change anime status immediately after rewatch is complete
    if (animeEpisodes >= episode + 1) {
      this.userRate = newUserRate;
      await this.changeEpisode(episode + 1);
    } else {
      this.userRate.episodes = episode;
    }

    this.notify.add(new Notification(NotificationType.OK, message));
    this.isWaitingUserRatesSubject.next(false);
  }

  openUploadForm() {
    this.isUploadOpened = true;
  }

  closeUploadForm() {
    this.isUploadOpened = false;
  }

  openAboutDialog() {
    this.dialog.open(AboutDialogComponent);
  }

  async openRequestsDialog() {
    const user = await firstValueFrom(this.whoami$);
    const shikimoriDomain = await firstValueFrom(this.shikimori.domain$);
    const data: IRequestDialogData = {
      video: this.currentVideo,
      requester: `${shikimoriDomain}/${user.nickname}`
    };
    const requestDialogRef = this.dialog.open(RequestDialogComponent, { minWidth: '50%', disableClose: true, data });

    requestDialogRef
      .afterClosed()
      .pipe(
        switchMap((request: SmarthardNet.IRequest) => request ? this.videosApi.createRequest(request) : EMPTY)
      )
      .subscribe(
        () => this.notify.add(new Notification(NotificationType.OK, 'Запрос успешно отправлен!')),
        () => this.notify.add(new Notification(NotificationType.ERROR, 'Не удалось отправить'))
      )
  }

  nextCommentsPage() {
    this.commentsService.nextPage();
  }

  private _chooseFavourite(videos: SmarthardNet.Shikivideo[]): SmarthardNet.Shikivideo[] {
    if (videos.length === 0) {
      return videos;
    }

    const preferences = this.preferenses.get(+videos[0].anime_id);
    const byAuthor = videos.filter((value) => {
      const author = `${value.author}`.toLocaleLowerCase();
      const prefAuthor = `${preferences.author}`.toLocaleLowerCase();

      return author === prefAuthor
        || !prefAuthor && author.includes(prefAuthor)
        || !author && prefAuthor.includes(author);
    });
    const byPlayer = byAuthor.filter((value) => value.getSecondLvlDomain() === preferences.player);
    const byQuality = byPlayer.filter((value) => value.quality === preferences.quality);

    if (byQuality.length > 0) {
      return byQuality;
    } else if (byPlayer.length > 0) {
      return byPlayer;
    } else if (byAuthor.length > 0) {
      return byAuthor;
    } else {
      return videos;
    }
  }
}
