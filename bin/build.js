#! /usr/bin/env node

const rp = require('request-promise')
const cheerio = require('cheerio')
const path = require('path')
const tempfile = require('tempfile')
const fs = require('fs')
const url = require('url')
const xlsx = require('node-xlsx')

require('dotenv').config()

const BASE_URL = 'https://www.nstc.org.tw/'

/* eslint-disable no-extend-native */
Date.prototype.addDays = function (days) {
  var dat = new Date(this.valueOf())
  dat.setDate(dat.getDate() + days)
  return dat
}
/* eslint-enable no-extend-native */

function main () {
  rp(BASE_URL).then(html => cheerio.load(html)).then(async function ($) {
    const href = $('#divSystemFoodMenu a').attr('href')
    const pdfUrl = url.resolve(BASE_URL, href)
    const downloadPath = tempfile('.pdf')
    const xlsPath = tempfile('.xls')

    // 20170928093553178
    var matchData = $('#divSystemFoodMenu a').attr('title').match(/(\d{4})-(\d{2})-(\d{2})/)

    await rp(pdfUrl, { encoding: 'binary' }).then(res => {
      const buffer = Buffer.from(res, 'binary')
      fs.writeFileSync(downloadPath, buffer, 'binary')

      var formData = {
        tab2exkey: process.env.API_KEY,
        fileName: 'menu',
        recognitionMethod: 'auto',
        outputFormat: 'XLS',
        xlsExportType: 'xlsx',
        file: fs.createReadStream(downloadPath)
      }
      rp.post({
        url: 'http://api2.pdfextractoronline.com:8089/tab2ex2/api',
        encoding: 'binary',
        formData: formData
      }).then(res => {
        const buffer = Buffer.from(res, 'binary')
        fs.writeFileSync(xlsPath, buffer, 'binary')
        const worksheets = xlsx.parse(xlsPath)

        //                                              month is zero-based
        var uploadedDay = new Date(Date.UTC(matchData[1], matchData[2] - 1, matchData[3]))

        // find neareast monday
        //                                     to next monday
        var firstDay = uploadedDay.addDays((8 - uploadedDay.getDay()) % 7)

        let data = {}
        for (var i = 0; i < worksheets.length; i++) {
          var day = firstDay.addDays(i)
          var dayString = day.toISOString().slice(0, 10).replace(/-/g, '')

          const addMeals = (index) => {
            var meals = []
            for (var mealIndex = 1; mealIndex < worksheets[i].data.length; mealIndex++) {
              var meal = worksheets[i].data[mealIndex][index]
              if (meal && meal.length > 0) {
                meals.push(meal)
              }
            }
            return meals
          }

          data[dayString] = {}
          data[dayString]['breakfast'] = addMeals(0)
          data[dayString]['launch'] = addMeals(1)
          data[dayString]['dinner'] = addMeals(2)
        }

        // console.log(data)
        fs.writeFileSync(path.resolve(__dirname, '../data.json'), JSON.stringify(data, null, 2))
      })
    })
  })
}

main()
