import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import fs from 'fs';

const TMDB_KEY = "15d2ea6d0dc1d476efbca3eba2b9bbfb";
const stateFile = 'backup_stremio_cms_pro.json';

function getSimilarity(s1, s2) {
  let longer = s1.toLowerCase(), shorter = s2.toLowerCase();
  if (s1.length < s2.length) { longer = s2.toLowerCase(); shorter = s1.toLowerCase(); }
  let longerLength = longer.length; if (longerLength == 0) return 1.0; let costs = new Array();
  for (let i = 0; i <= longer.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= shorter.length; j++) {
      if (i == 0) costs[j] = j;
      else { if (j > 0) { let newValue = costs[j - 1]; if (longer.charAt(i - 1) != shorter.charAt(j - 1)) newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1; costs[j - 1] = lastValue; lastValue = newValue; } }
    }
    if (i > 0) costs[shorter.length] = lastValue;
  }
  return (longerLength - costs[shorter.length]) / parseFloat(longerLength);
}

async function run() {
  if (!fs.existsSync(stateFile)) return;
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  for (let list of state.lists) {
    const service = list.preset || 'netflix'; const source = list.source || 'flixpatrol'; const mediaType = list.type === 'series' ? 'tv' : 'movie';
    let url = `https://flixpatrol.com/top10/${service}/brazil/`;
    if (source === 'justwatch') {
       const jwMap = { netflix: 'netflix', max: 'hbo-max', 'amazon-prime': 'amazon-prime-video', disney: 'disney-plus', 'apple-tv': 'apple-tv-plus', paramount: 'paramount-plus' };
       url = `https://www.justwatch.com/br/provedor/${jwMap[service] || 'netflix'}`;
    }
    try {
      console.log(`🌐 Raspando ${source}: ${url}`);
      const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
      const html = await response.text(); const $ = cheerio.load(html);
      let titles = [];
      if (source === 'justwatch') {
        $('a[href*="/filme/"], a[href*="/serie/"], a[href*="/movie/"], a[href*="/tv-show/"]').each((i, el) => {
          if (titles.length >= 10) return; const href = $(el).attr('href') || '';
          if (href.includes('/provedor/') || href.includes('justwatch.com/br')) return;
          const slugTitle = href.split('/').filter(Boolean).pop()?.replace(/-/g, ' ');
          if (slugTitle && !titles.includes(slugTitle)) titles.push(slugTitle.trim());
        });
      } else {
        $('a[href*="/title/"]').each((i, el) => { const t = $(el).text().trim(); if (t && titles.length < 10 && !titles.includes(t)) titles.push(t); });
      }
      for (let i = 0; i < 10; i++) {
        if (i < titles.length) {
          let scrapedTitle = titles[i]; if (scrapedTitle.toLowerCase().includes('agente kim')) scrapedTitle = "The Recruit";
          const existingSlot = list.slots[i]; const similarity = getSimilarity(scrapedTitle, existingSlot.name || "");
          if (existingSlot.active && similarity > 0.75) { console.log(`🛡️ Slot #${i+1} mantido pela curadoria`); continue; }
          console.log(`🔄 Atualizando Slot #${i+1}: ${scrapedTitle}`);
          const searchUrl = `https://api.themoviedb.org/3/search/${mediaType}?api_key=${TMDB_KEY}&query=${encodeURIComponent(scrapedTitle)}&language=pt-BR`;
          let sRes = await (await fetch(searchUrl)).json();
          if (!sRes.results?.length) sRes = await (await fetch(`https://api.themoviedb.org/3/search/${mediaType}?api_key=${TMDB_KEY}&query=${encodeURIComponent(scrapedTitle)}&language=en-US`)).json();
          if (sRes.results?.length) {
            const tmdbId = sRes.results[0].id; const d = await (await fetch(`https://api.themoviedb.org/3/${mediaType}/${tmdbId}?api_key=${TMDB_KEY}&language=pt-BR&append_to_response=external_ids`)).json();
            list.slots[i].name = d.title || d.name; list.slots[i].imdb = d.external_ids?.imdb_id || `tmdb:${tmdbId}`;
            list.slots[i].poster = d.poster_path ? `https://image.tmdb.org/t/p/w600_and_h900_bestv2${d.poster_path}` : ''; list.slots[i].active = true;
          }
        }
      }
    } catch(e) { console.error(`Erro no robô:`, e.message); }
  }
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
}
run();