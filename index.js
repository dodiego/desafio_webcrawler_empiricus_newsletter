const fs = require('fs')
const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({args: ['--no-sandbox'], headless: false})
  const page = await browser.newPage()
  const EMPIRICUS_NEWSLETTER_HOME = 'https://www.empiricus.com.br/conteudo/newsletters/'
  await page.goto(EMPIRICUS_NEWSLETTER_HOME)
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
  let result = await Promise.all(articles.map(async article => {
    let articlePage = await browser.newPage()
    await articlePage.goto(article.url, {waitUntil: ['networkidle0', 'load']})
    return {
      ...article,
      ...await articlePage.evaluate(() => {
        const SUMMARY_SELECTOR = '#article-content > header > h2'
        const CONTENT_SELECTOR = '#article-content > section.article--content'
        const IMAGE_SELECTOR = '#article-content > section.article--main-image > img'

        let imageElement = document.querySelector(IMAGE_SELECTOR)
        imageElement.focus()
        return {
          image: imageElement.src,
          textContent: `${document.querySelector(SUMMARY_SELECTOR).textContent}\n\n
        ${document.querySelector(CONTENT_SELECTOR).textContent}`,
          htmlContent: document.querySelector(SUMMARY_SELECTOR)
        }
      })
    }
  }))
  fs.writeFileSync('result.json', JSON.stringify(result, null, 2))
  await browser.close()
})()
