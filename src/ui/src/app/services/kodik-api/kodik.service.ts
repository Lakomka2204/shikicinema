import {Injectable} from '@angular/core';
import {HttpClient, HttpParams} from '@angular/common/http';
import {shareReplay} from 'rxjs/operators';
import {SmarthardNet} from '../../types/smarthard-net';
import {Shikimori} from '../../types/shikimori';
import {Kodik} from '../../types/kodik';
import {environment} from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class KodikService {

  private _kodikResponseCache: Kodik.ISearchResponse;

  constructor(
    private http: HttpClient
  ) {}

  private static _translateQuality(quality: string) {
    const animeQualities = ['TV', 'DVD', 'BD', 'WEB', 'UNKNOWN'];

    for (const animeQ of animeQualities) {
      if (quality.toUpperCase().includes(animeQ)) {
        return animeQ;
      }
    }

    return 'unknown';
  }

  private static _castToShikivideo(animeId: number, season: string, episode: number, kodikvideo: Kodik.IVideo) {
    const link = kodikvideo.seasons[season].episodes[episode];
    const url = `https:${link}`;

    return new SmarthardNet.Shikivideo({
      id: url,
      anime_id: animeId,
      url: url,
      episode: episode,
      quality: KodikService._translateQuality(kodikvideo.quality),
      anime_russian: kodikvideo.title,
      anime_english: kodikvideo.title_orig,
      author: kodikvideo.translation.title,
      kind: 'озвучка',
      language: 'russian',
      foreign: true
    });
  }

  private static _buildNewUnique(unique: SmarthardNet.Unique, newValues: object, episode: string): SmarthardNet.Unique {

    if (unique && unique[episode]) {
      for (const key in unique[episode]) {
        const newUnique = new Set([ ...unique[episode][key], ...newValues[key] ]);
        unique[episode][key] = [...newUnique];
      }
    } else {
      unique[episode] = newValues;
    }

    return unique[episode];
  }

  private _getCachedResponse() {
    return this._kodikResponseCache;
  }

  private _getKodikvideos(anime: Shikimori.Anime) {
    return this.http.get<Kodik.ISearchResponse>(`https://kodikapi.com/search`, { params: new HttpParams()
        .set('token', `${environment.KODIK_TOKEN}`)
        .set('types', 'anime,anime-serial')
        .set('strict', 'true')
        .set('with_seasons', 'true')
        .set('with_episodes', 'true')
        .set('title', anime.name)
    })
      .pipe(
        shareReplay(1)
      );
  }

  private async _getSeason(anime: Shikimori.Anime) {
    const response = await this.getVideos(anime);
    const season = null;

    if (response.results[0] && response.results[0].seasons && !response.results[0].seasons[season]) {
      return Object.keys(response.results[0].seasons)[0];
    }

    return season;
  }

  public async getVideos(anime: Shikimori.Anime) {
    let response = this._getCachedResponse();

    if (!response) {
      response = await this._getKodikvideos(anime).toPromise();
      this._kodikResponseCache = response;
    }

    return response;
  }

  public async search(anime: Shikimori.Anime, episode: number): Promise<SmarthardNet.Shikivideo[]> {
    const response = await this.getVideos(anime);
    const season = await this._getSeason(anime);

    if (!season) {
      return [];
    }

    return response.results
      .filter(video => video && video.seasons[season] && video.seasons[season].episodes[episode])
      .map(v => KodikService._castToShikivideo(anime.id, season, episode, v));
  }

  public async getUnique(anime) {
    const response = await this.getVideos(anime);
    const season = await this._getSeason(anime);
    const unique = new SmarthardNet.Unique();

    if (season) {
      const videos = response.results.filter(video => video.seasons[season]);

      for (const video of videos) {
        const newValues = {
          author: [video.translation.title],
          url: [new URL(`https://${video.link}`).hostname],
          quality: [KodikService._translateQuality(video.quality)],
          kind: ['озвучка'],
          language: ['russian']
        };

        for (const episode in video.seasons[season].episodes) {
          unique[episode] = KodikService._buildNewUnique(unique, newValues, episode)
        }
      }

      return unique;
    }

    return {};
  }

}
