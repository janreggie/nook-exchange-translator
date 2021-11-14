import { Convert as ItemsConvert, Items as ItemsType } from './json-parser/Items'
import { Convert as TranslationsConvert, Translations as TranslationsType } from './json-parser/Translations'
import { Convert as AdjectivesConvert, Adjectives as AdjectivesType } from './json-parser/Adjectives'
import { GetTranslation, Parser as AeonParser } from './aeon-parser'

const OLD_JSON_DIR = './old-json'
const AEON_CSV_DIR = './aeon-csvs'

// capitalize the first letter of a name
function capitalizeName (name : string) : string {
  if (!name) { return '' }
  if (name >= 'a' && name <= 'z') {
    const first = name.charAt(0)
    return first.toUpperCase() + name.slice(1)
  }
  return name
}

const Locales = ['de', 'en-gb', 'es-eu', 'es-us', 'fr-eu', 'fr-us', 'it', 'ja', 'ko', 'nl', 'ru', 'zh-cn', 'zh-tw']

// Read Nook Exchange data
const NookExchangeItems : Map<number, ItemsType> = ItemsConvert.fileToItems(`${OLD_JSON_DIR}/items.json`)
const NookExchangeAdjectives : Map<number, AdjectivesType> = AdjectivesConvert.fileToAdjectives(`${OLD_JSON_DIR}/variants.json`)
const NameToNookExchangeId = new Map<string, number>()
for (const [k, v] of NookExchangeItems.entries()) {
  NameToNookExchangeId.set(v.name, k)
}

// Read Nook Exchange translations
const OldTranslations = new Map<string, TranslationsType>()
for (const locale of Locales) {
  OldTranslations.set(locale, TranslationsConvert.fileToTranslations(`${OLD_JSON_DIR}/translations/${locale}.json`))
}

async function main () {
  // Read some items to see if things go well
  for (const id of [13018, 4463, 12543, 3449]) {
    console.log(`For ID ${id}`)
    console.log('Item: ', NookExchangeItems.get(id))
    console.log('Adjectives: ', NookExchangeAdjectives.get(id))
    console.log('es-eu translations: ', OldTranslations.get('es-eu')!.items.get(id))
    console.log()
  }
  // Read Aeon CSV data
  const wetsuits = await AeonParser(`${AEON_CSV_DIR}/Wetsuits.csv`)
  for (const locale of Locales) {
    console.log(`${locale} : ${GetTranslation(wetsuits[0], locale)}`)
  }
}

main()
