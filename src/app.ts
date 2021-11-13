import { readFileSync } from 'fs'
import { Convert as ItemsConvert, Items as ItemsType } from './json-parser/Items'
import { Convert as TranslationsConvert, Translations as TranslationsType } from './json-parser/Translations'
import { Convert as AdjectivesConvert } from './json-parser/Adjectives'

function openFile (filename : string) : string {
  return readFileSync(filename).toString()
}

function main () {
  const Locales = ['de', 'en-gb', 'es-eu', 'es-us', 'fr-eu', 'fr-us', 'it', 'ja', 'ko', 'nl', 'ru', 'zh-cn', 'zh-tw']

  const NookExchangeItems : Map<number, ItemsType> = ItemsConvert.toItems(openFile('./old-json/items.json'))
  const NookExchangeAdjectives : Map<number, (string | string[])[]> = AdjectivesConvert.toAdjectives(openFile('./old-json/variants.json'))

  const OldTranslations = new Map<string, TranslationsType>()
  Locales.forEach(locale => {
    OldTranslations.set(locale, TranslationsConvert.toTranslations(openFile(`./old-json/translations/${locale}.json`)))
  })

  // Read some items to see if things go well
  for (const id of [13018, 4463, 12543, 3449]) {
    console.log(`For ID ${id}`)
    console.log('Item: ', NookExchangeItems.get(id))
    console.log('Adjectives: ', NookExchangeAdjectives.get(id))
    console.log('es-eu translations: ', OldTranslations.get('es-eu')?.items.get(id))
    console.log()
  }
}

main()
