import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import fs from 'fs';

const TMDB_KEY = "15d2ea6d0dc1d476efbca3eba2b9bbfb";
const stateFile = 'backup_stremio_cms.json';

async function scrapeFlixPatrol(service, isSeries) {
  const url = `https://flixpatrol.com/top10/${service}/brazil/`;
  console.log(`🌐 Raspando FlixPatrol: ${url}`);
  
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  });
  const html = await response.text();
  const $ = cheerio.load(html);
  
  let titles = [];
  const targetTableIdx = isSeries ? 1 : 0;
  
  $('table.table-hover').eq(targetTableIdx).find('tr').each((i, el) => {
    const titleText = $(el).find('td').eq(2).text().trim();
    if (titleText && titles.length < 10) {
      titles.push(titleText);
    }
  });
  
  return titles;
}

async function run() {
  if (!fs.existsSync(stateFile)) return;
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  
  for (let list of state.lists) {
    const service = list.preset || 'netflix';
    const isSeries = list.type === 'series';
    const mediaType = isSeries ? 'tv' : 'movie';
    
    try {
      const titles = await scrapeFlixPatrol(service, isSeries);
      console.log(`Encontrados no FlixPatrol [${service}]:`, titles);
      
      for (let i = 0; i < 10; i++) {
        if (i < titles.length) {
          const query = titles[i];
          const searchUrl = `https://api.themoviedb.org/3/search/${mediaType}?api_key=${TMDB_KEY}&query=${encodeURIComponent(query)}&language=pt-BR`;
          const sRes = await (await fetch(searchUrl)).json();
          
          if (sRes.results?.length) {
            const tmdbId = sRes.results[0].id;
            const detailsUrl = `https://api.themoviedb.org/3/${mediaType}/${tmdbId}?api_key=${TMDB_KEY}&language=pt-BR&append_to_response=external_ids`;
            const d = await (await fetch(detailsUrl)).json();
            
            list.slots[i].name = d.title || d.name;
            list.slots[i].imdb = d.external_ids?.imdb_id || `tmdb:${tmdbId}`;
            list.slots[i].poster = d.poster_path ? `https://image.tmdb.org/t/p/w600_and_h900_bestv2${d.poster_path}` : '';
            list.slots[i].active = true;
          }
        }
      }
    } catch(e) {
      console.error(`Erro ao raspar FlixPatrol para ${service}:`, e.message);
    }
  }
  
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
  console.log('✅ Varredura do FlixPatrol finalizada com sucesso!');
}

run();