const axios = require('axios');
const cheerio = require('cheerio');
const { URL } = require('url');

/**
 * Recursively scrapes a website starting from a given URL.
 * It only scrapes pages within the same domain.
 * @param {string} startUrl The URL to start scraping from.
 * @param {number} [maxPages=50] The maximum number of pages to scrape.
 * @returns {Promise<string>} A promise that resolves to all the extracted text content.
 */
async function scrapeWebsite(startUrl, maxPages = 50) { // MODIFICATION: Added maxPages parameter
    const visitedUrls = new Set();
    const queue = [startUrl];
    let allText = '';
    const baseUrl = new URL(startUrl).origin;

    console.log(`[Scraper] Starting scrape for domain: ${baseUrl}`);

    // MODIFICATION: Added a loop condition to respect maxPages
    while (queue.length > 0 && visitedUrls.size < maxPages) {
        const currentUrl = queue.shift();

        if (visitedUrls.has(currentUrl)) {
            continue;
        }

        try {
            // MODIFICATION: Improved logging to show progress
            const progress = `(Visited: ${visitedUrls.size + 1}/${maxPages}, Queue: ${queue.length})`;
            console.log(`[Scraper] Scraping: ${currentUrl} ${progress}`);
            
            visitedUrls.add(currentUrl);

            const response = await axios.get(currentUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                timeout: 10000 // Add a timeout to prevent hanging on a single request
            });
            const html = response.data;
            const $ = cheerio.load(html);

            $('script, style, nav, footer, header, noscript').remove();
            const pageText = $('body').text().replace(/\s\s+/g, ' ').trim();
            
            if (pageText) {
                allText += pageText + '\n\n';
            }

            $('a').each((_i, link) => {
                const href = $(link).attr('href');
                if (href) {
                    try {
                        const nextUrl = new URL(href, baseUrl);
                        
                        // Clean up URL by removing hash and search params for cleaner queue
                        nextUrl.hash = '';
                        const nextUrlStr = nextUrl.href;

                        if (nextUrl.origin === baseUrl && !visitedUrls.has(nextUrlStr)) {
                            queue.push(nextUrlStr);
                        }
                    } catch (e) {
                        // Ignore invalid URLs
                    }
                }
            });

        } catch (error) {
            console.error(`[Scraper] Error scraping ${currentUrl}: ${error.code || error.message}`);
        }
    }

    if (visitedUrls.size >= maxPages) {
        console.log(`[Scraper] Reached max page limit of ${maxPages}.`);
    }

    console.log(`[Scraper] Scraping complete. Total pages visited: ${visitedUrls.size}.`);
    return allText;
}

module.exports = { scrapeWebsite };