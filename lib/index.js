const fs = require('fs')
const path = require('path')
const moment = require('moment')
const puppeteer = require('puppeteer')

const EMPIRICUS_NEWSLETTER_HOME = 'https://www.empiricus.com.br/conteudo/newsletters/'
const MAX_DAYS_DIFFERENCE = 30

moment.locale('pt-BR')

async function fetchArticles (browser, page, result = []) {
  let fetchNextPage = true
  let articles = await page.evaluate(() => {
    const ARTICLE_SELECTOR = 'ul > li > article > a'
    const TITLE_SELECTOR = 'div.list-item--meta > h2'
    const DATE_SELECTOR = 'div.list-item--meta > p.list-item--info'
    let dateRegex = /.+\s+-\s+(\d.+)/
    return [...document.querySelectorAll(ARTICLE_SELECTOR)].map(article => ({
      url: article.href,
      title: article.querySelector(TITLE_SELECTOR).textContent,
      date: dateRegex.exec(article.querySelector(DATE_SELECTOR).textContent)[1]
    }))
  })
  for (let article of articles) {
    let articleDate = moment(article.date, 'D [de] MMMM[,] YYYY')
    let daysDifference = moment().diff(articleDate, 'days')
    console.log(article.url, daysDifference)
    if (daysDifference <= MAX_DAYS_DIFFERENCE) {
      let articlePage = await browser.newPage()
      await articlePage.goto(article.url)
      await articlePage.evaluate(() => {
        let promises = []
        let lazyImages = document.querySelectorAll('img[class*="b-lazy"][data-src]')
        for (var i = 0; i < lazyImages.length; i++) {
          var image = lazyImages.item(i)
          let promise = new Promise((resolve) => {
            image.onload = resolve
            image.setAttribute('src', image.getAttribute('data-src'))
          })
          promises.push(promise)
        }
        return Promise.all(promises)
      })
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
    } else {
      fetchNextPage = false
      break
    }
  }
  if (fetchNextPage) {
    let nextPageUrl = await page.evaluate(() => {
      const NEXT_PAGE_SELECTOR = 'body > div.page-content > div > section > nav > nav > nav > div > a.next.page-numbers'
      return document.querySelector(NEXT_PAGE_SELECTOR).href
    })
    await page.goto(nextPageUrl)
    return fetchArticles(browser, page, result)
  } else {
    return result
  }
}

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'], headless: !process.env.DEBUG })
  const page = await browser.newPage()
  await page.goto(EMPIRICUS_NEWSLETTER_HOME)
  let result = await fetchArticles(browser, page)
  fs.writeFileSync(path.join(__dirname, '..', 'result.json'), JSON.stringify(result, null, 2))
  await browser.close()
})()
