import {Injectable} from '@angular/core';
import {HttpClient, HttpErrorResponse, HttpHeaders, HttpParams, HttpResponse} from '@angular/common/http';
import {EMPTY, Observable, throwError} from 'rxjs';
import {SmarthardNet} from '../../types/smarthard-net';
import {environment} from '../../../environments/environment';
import {catchError, map} from 'rxjs/operators';
import {Shikimori} from '../../types/shikimori';

@Injectable({
  providedIn: 'root'
})
export class ShikivideosService {

  private SHIKIVIDEOS_API: string = 'https://smarthard.net/api/shikivideos';

  private static _buildRequest(request: SmarthardNet.IRequest) {
    return new SmarthardNet.Request(
      request.id,
      request.type,
      request.target_id,
      request.requester,
      request.comment,
      request.request,
      request.old,
      request.approved,
      request.reviewer_id,
      new Date(request.reviewed),
      request.feedback,
      new Date(request.createdAt)
    );
  }

  constructor(private http: HttpClient) { }

  public uploadVideo(params: HttpParams): Observable<HttpResponse<SmarthardNet.Shikivideo | any>> {
    return this.http.post<SmarthardNet.Shikivideo>(`${this.SHIKIVIDEOS_API}`, {}, { params, observe: 'response' });
  }

  public findById(animeId: number, params: HttpParams): Observable<SmarthardNet.Shikivideo[]> {
    return this.http.get<SmarthardNet.Shikivideo[]>(`${this.SHIKIVIDEOS_API}/${animeId}`, { params })
      .pipe(
        map(
          (videos) => videos.map(v => new SmarthardNet.Shikivideo(v))
        )
      );
  }

  public search(params: HttpParams): Observable<SmarthardNet.Shikivideo[]> {
    return this.http.get<SmarthardNet.Shikivideo[]>(`${this.SHIKIVIDEOS_API}/search`, { params })
  }

  public contributions(params: HttpParams): Observable<{ count: number }> {
    return this.http.get<{ count: number }>(`${this.SHIKIVIDEOS_API}/contributions`, { params });
  }

  public getAnimeMaxLoadedEp(animeId: number): Observable<{length: number}> {
    return this.http.get<{length: number}>(`${this.SHIKIVIDEOS_API}/${animeId}/length`);
  }

  public getUniqueValues(params: HttpParams): Observable<SmarthardNet.Unique> {
    return this.http.get<SmarthardNet.Unique>(`${this.SHIKIVIDEOS_API}/unique`, { params });
  }

  public getNewToken(shikimoriToken: Shikimori.Token): Observable<SmarthardNet.Token> {
    const params = new HttpParams()
      .set('grant_type', 'shikimori_token')
      .set('client_id', environment.SHIKIVIDEOS_CLIENT_ID)
      .set('client_secret', environment.SHIKIVIDEOS_CLIENT_SECRET)
      .set('scopes', 'database:shikivideos_create');
    const body = {
      shikimori_token: shikimoriToken.token
    };

    return this.http.put<SmarthardNet.IToken>('https://smarthard.net/oauth/token', body, { params })
      .pipe(
        map((token) => new SmarthardNet.Token(token.access_token, token.expires, token.refresh_token))
      );
  }

  public getRefreshedToken(oldToken: SmarthardNet.Token): Observable<SmarthardNet.Token> {
    const params = new HttpParams()
      .set('grant_type', 'refresh_token')
      .set('refresh_token', oldToken.refresh)
      .set('client_id', environment.SHIKIVIDEOS_CLIENT_ID)
      .set('client_secret', environment.SHIKIVIDEOS_CLIENT_SECRET)
      .set('scopes', 'database:shikivideos_create');

    return this.http.get<SmarthardNet.IToken>('https://smarthard.net/oauth/token', { params })
      .pipe(
        map((token) => new SmarthardNet.Token(token.access_token, token.expires, token.refresh_token))
      );
  }

  public getRequestById(id: number | string): Observable<SmarthardNet.Request> {
    return this.http.get<SmarthardNet.IRequest>(`https://smarthard.net/api/requests/${id}`)
      .pipe(
        map((request) => ShikivideosService._buildRequest(request))
      )
  }

  public createRequest(request: SmarthardNet.IRequest): Observable<SmarthardNet.Request>{
    let params = new HttpParams()
      .set('type', `${request.type}`);

    const body = {
      request: request.request,
      comment: request.comment,
      requester: request.requester
    };

    if (request.target_id) {
      params = params.set('target_id', `${request.target_id}`);
    }

    return this.http.post<SmarthardNet.IRequest>('https://smarthard.net/api/requests', body, { params })
      .pipe(
        map((request) => ShikivideosService._buildRequest(request))
      );
  }

  public getReleaseNotes(version: string) {
    const headers = new HttpHeaders().set('Content-Type', 'text/plain; charset=utf-8');

    return this.http.get(`${this.SHIKIVIDEOS_API}/release-notes/${version}`, { headers, responseType: 'text'})
      .pipe(
        catchError((err: HttpErrorResponse) => err.status === 404 ? EMPTY : throwError(err))
      );
  }

  public getNotifications(version: string): Observable<SmarthardNet.Notification[]> {
    const params = new HttpParams()
      .set('version', version);

    return this.http.get<SmarthardNet.INotification[]>(`https://smarthard.net/api/notifications`, { params })
      .pipe(
        map((notifications) => notifications
          .map(notification => {
            const id = notification.id;
            const info = notification.info;
            const viewed = false;
            const created = new Date(Date.parse(notification.createdAt));
            const expires = notification.expires ? new Date(Date.parse(notification.expires)) : null;
            const minVersion = notification.min_version;
            const maxVersion = notification.max_version;

            return new SmarthardNet.Notification(id, created, info, viewed, minVersion, maxVersion, expires)
          })
        )
      );
  }
}
