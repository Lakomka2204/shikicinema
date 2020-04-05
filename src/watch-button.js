'use strict';

let timeout = null;
const PLAYER_URL = chrome.runtime.getURL('/index.html');
const SHIKIVIDEOS_API = 'https://smarthard.net/api/shikivideos';
const KODIK_TOKEN = `${process.env.KODIK_TOKEN}`;
const PLAYER_BUTTON = document.createElement('a');
const INFO_DIV = document.createElement('div');
const ON_WATCH_CLICK = async (anime) => {
  const userRate = await _getAnimeInfo(anime.id)
    .then((updatedAnime) => updatedAnime.user_rate)
    .catch(() => null);
  const episode = await _getEpisode(anime, userRate ? userRate.episodes : 0);

  chrome.runtime.sendMessage({ openUrl: `${PLAYER_URL}#/${anime.id}/${episode}` });
};

const OBSERVER = new MutationObserver(() => {
  let animeId = `${window.location}`.match(/\d+/);
  let isAnimePage = `${window.location}`.includes('/animes/');
  let divInfo = document.querySelector('div.c-info-right');
  let watchButton = document.querySelector('a#watch_button');

  if (timeout)
    clearTimeout(timeout);

  timeout = setTimeout(async () => {
    let anime = isAnimePage ? await _getAnimeInfo(animeId) : {};

    if (divInfo && isAnimePage && !watchButton) {
      appendWatchButtonTo(divInfo, anime);
    } else if (isAnimePage && watchButton) {
      watchButton.onclick = () => ON_WATCH_CLICK(anime);
    }
  }, 100);
});

OBSERVER.observe(document, {childList: true, subtree: true});

function _getUploadedEpisodes(animeId) {
  return fetch(`${SHIKIVIDEOS_API}/${animeId}/length`)
    .then((res) => res.json())
    .then((res) => res.length)
    .catch(() => 0);
}

function _getKodikEpisodes(anime) {
  const type = anime.kind === 'movie' || anime.episodes === 1 ? 'anime' : 'anime-serial';
  const query = `strict=true&types=${type}&with_episodes=true&title=${anime.name}&token=${KODIK_TOKEN}`;

  return fetch(`https://kodikapi.com/search?${query}`)
    .then((res) => res.json())
    .then((res) => {
      let episodes;

      try {
        const seasonNo = Object.keys(res.results[0].seasons)[0];
        const season = res.results[0].seasons[seasonNo].episodes;
        episodes = Math.max.apply(null, Object.keys(season));
      } catch (e) {
        episodes = 0;
      }

      return episodes;
    })
    .catch(() => 0);
}

function _getAnimeInfo(animeId) {
  return fetch(`https://shikimori.one/api/animes/${animeId}`)
    .then((res) => res.json());
}

async function _getEpisode(anime, watchedEpisode) {
  const targetEpisode = watchedEpisode ? +watchedEpisode + 1 : 1;
  const mainArchiveMax = await _getUploadedEpisodes(anime.id);
  const kodikMax = await _getKodikEpisodes(anime);
  const maxAvailable = Math.max(mainArchiveMax, kodikMax);

  return Math.min(targetEpisode, +maxAvailable);
}

async function appendWatchButtonTo(element, anime) {
  const lastOrMaxEpisodeAvailable = await _getEpisode(anime);

  PLAYER_BUTTON.id = 'watch_button';
  PLAYER_BUTTON.classList.add('b-link_button', 'dark', 'watch-online');
  PLAYER_BUTTON.classList.remove('upload-video');
  PLAYER_BUTTON.textContent = 'Смотреть онлайн';
  PLAYER_BUTTON.style.margin = '0 10%';
  PLAYER_BUTTON.onclick = () => ON_WATCH_CLICK(anime);

  element.appendChild(PLAYER_BUTTON);
  element.appendChild(INFO_DIV);

  if (lastOrMaxEpisodeAvailable === 0 || anime.status === 'anons') {
    PLAYER_BUTTON.textContent = 'Загрузить видео';
    PLAYER_BUTTON.classList.add('upload-video');
    PLAYER_BUTTON.classList.remove('watch-online');
  }
}
