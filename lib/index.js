const fs = require('fs')
const moment = require('moment')
const puppeteer = require('puppeteer')

const EMPIRICUS_NEWSLETTER_HOME = 'https://www.empiricus.com.br/conteudo/newsletters/'
const MAX_DAYS_INTERVAL = 30

moment.locale('pt-BR')

async function fetchPageArticles (browser, page) {
  let result = []
  let articles = await page.evaluate(() => {
    const POST_SELECTOR = 'ul > li > article > a'
    const TITLE_SELECTOR = 'div.list-item--meta > h2'
    const DATE_SELECTOR = 'div.list-item--meta > p.list-item--info'
    let dateRegex = /.+\s+-\s+(\d.+)/
    return [...document.querySelectorAll(POST_SELECTOR)].map(post => ({
      url: post.href,
      title: post.querySelector(TITLE_SELECTOR).textContent,
      date: dateRegex.exec(post.querySelector(DATE_SELECTOR).textContent)[1]
    }))
  })
  for (let article of articles) {
    let articlePage = await browser.newPage()
    await articlePage.goto(article.url, {waitUntil: ['networkidle0', 'load']})
    let details = await articlePage.evaluate(() => {
      const SUMMARY_SELECTOR = '#article-content > header > h2'
      const CONTENT_SELECTOR = '#article-content > section.article--content'
      const IMAGE_SELECTOR = '#article-content > section.article--main-image > img'
      const CONTENT_AD_SELECTOR = '#article-content > section.article--content > div.ad-dinamico'
      let imageElement = document.querySelector(IMAGE_SELECTOR)
      let adElement = document.querySelector(CONTENT_AD_SELECTOR)
      let contentElement = document.querySelector(CONTENT_SELECTOR)
      contentElement.removeChild(adElement)
      return {
        image: (imageElement || {}).src,
        textContent: `${document.querySelector(SUMMARY_SELECTOR).textContent}\n\n${contentElement.textContent}`,
        htmlContent: contentElement.outerHTML
      }
    })
    await articlePage.close()
    result.push({
      ...article,
      ...details
    })
  }
  return result
}

(async () => {
  const browser = await puppeteer.launch({args: ['--no-sandbox'], headless: !process.env.DEBUG})
  const page = await browser.newPage()
  await page.goto(EMPIRICUS_NEWSLETTER_HOME)
  let result = {
    items: [],
    fetchNext: true
  }
  do {
    let currentPageArticles = await fetchPageArticles(browser, page)
    for (let i = 0; i < currentPageArticles.length; i++) {
      var article = currentPageArticles[i]
      let articleDate = moment(article.date, 'D [de] MMMM[,] YYYY')
      if (moment().diff(articleDate, 'days') <= MAX_DAYS_INTERVAL) {
        result.items.push(article)
      } else {
        result.fetchNext = false
        break
      }
    }
    if (result.fetchNext) {
      let nextPageUrl = await page.evaluate(() => {
        const NEXT_PAGE_SELECTOR = 'body > div.page-content > div > section > nav > nav > nav > div > a.next.page-numbers'
        return document.querySelector(NEXT_PAGE_SELECTOR).href
      })
      await page.goto(nextPageUrl)
    }
  } while (result.fetchNext)
  fs.writeFileSync('../result.json', JSON.stringify(result.items, null, 2))
  await browser.close()
})()
