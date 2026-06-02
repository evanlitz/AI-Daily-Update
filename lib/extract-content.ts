import axios from 'axios'
import * as cheerio from 'cheerio'

// Domains that won't yield useful article text
const SKIP = /arxiv\.org\/pdf|\.pdf$|twitter\.com|x\.com|reddit\.com|github\.com|youtu\.?be|youtube\.com|linkedin\.com|instagram\.com|facebook\.com/i

export async function extractPageContent(url: string): Promise<string> {
  if (SKIP.test(url)) return ''
  try {
    const res = await axios.get<string>(url, {
      timeout: 5000,
      maxContentLength: 500_000,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AIPulse/1.0)' },
    })
    const ct = String(res.headers['content-type'] ?? '')
    if (!ct.includes('text/html')) return ''
    const $ = cheerio.load(res.data)
    $('script, style, nav, header, footer, aside, .ad, .ads, [aria-hidden="true"]').remove()
    const text =
      $('article').first().text() ||
      $('main').first().text() ||
      $('[role="main"]').first().text() ||
      $('body').text()
    return text.replace(/\s+/g, ' ').trim().slice(0, 2000)
  } catch {
    return ''
  }
}
