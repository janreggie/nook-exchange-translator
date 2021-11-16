import { Convert as ItemsConvert, Items as ItemsType, VariantsType, VariantsTypeOf } from './json-parser/Items'
import { Convert as TranslationsConvert, Translations as TranslationsType } from './json-parser/Translations'
import { Convert as AdjectivesConvert, Adjectives as AdjectivesType } from './json-parser/Adjectives'
import { AeonKey, AeonTranslations, GetTranslation, Parser as AeonParser } from './aeon-parser'
import { CapitalizeName, errorAndExit, LowercaseName } from './util'

const OLD_JSON_DIR = './old-json'
const AEON_CSV_DIR = './aeon-csvs'

const Locales = ['de', 'en-gb', 'es-eu', 'es-us', 'fr-eu', 'fr-us', 'it', 'ja', 'ko', 'nl', 'ru', 'zh-cn', 'zh-tw']

// Read Nook Exchange data
const NookExchangeItems : Map<number, ItemsType> = ItemsConvert.fileToItems(`${OLD_JSON_DIR}/items.json`)
const NookExchangeAdjectives : Map<number, AdjectivesType> = AdjectivesConvert.fileToAdjectives(`${OLD_JSON_DIR}/variants.json`)
const NameToNookExchangeId = new Map<string, number>() // Name must be in all lower case
for (const [k, v] of NookExchangeItems.entries()) {
  if (NameToNookExchangeId.has(v.name.toLocaleLowerCase())) {
    errorAndExit(`Duplicate item ${v.name} in list of items`)
  }
  NameToNookExchangeId.set(v.name.toLocaleLowerCase(), k)
}

// Read Nook Exchange translations
const OldTranslations = new Map<string, TranslationsType>()
for (const locale of Locales) {
  OldTranslations.set(locale, TranslationsConvert.fileToTranslations(`${OLD_JSON_DIR}/translations/${locale}.json`))
}

// For later...
const newTranslations = new Map<string, TranslationsType>()
for (const locale of Locales) {
  newTranslations.set(locale, {
    items: new Map(),
    materials: new Map()
  })
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

  // Okay, but what *are* the materials that we'll need translating?
  const materials = new Set<string>()
  for (const item of NookExchangeItems.values()) {
    if (!item.recipe) {
      continue
    }

    // The recipes are stored from length two onwards
    const requirements = item.recipe.slice(2) as Array<Array<string|number>>
    for (const item of requirements) {
      materials.add(item[1] as string)
    }
  }

  // All Item Translations go here
  const allItemTranslations = new Map<string, AeonTranslations>()

  const nonSpecialCategories = [
    'Bug Models',
    'Dishes',
    'Door Deco',
    'Etc',
    'Event Items',
    'Fish Models',
    'Floors',
    'Fossils',
    'Furniture',
    'Gyroids',
    'Harvs Island Items',
    'Money',
    'Music',
    'Plants',
    'Posters',
    'Rugs',
    'Tools',
    'Umbrellas',
    'Wallpaper'
  ]
  const nonSpecialItems = await OpenAeons(nonSpecialCategories) // AeonItem.Id -> Translations obj

  // Special cases: Some items are plural, others aren't
  const somePluralCategories = [
    'Crafting Items', // TODO: Reconcile because some Crafting Items have similar English names
    'Fencing', // TODO: Reconcile: use singular
    'Shells'
  ]

  // Special cases: Photos

  // Special cases: Art

  // Read data from Clothing
  const clothingCategories = ['Accessories', 'Bags', 'Bottoms', 'Caps', 'Dress-Up', 'Handbags', 'Helmets', 'Shoes', 'Socks', 'Tops', 'Wetsuits']
  const clothingItems = await OpenAeons(clothingCategories)
  const clothingItemTraslations = new Map<string, AeonTranslations>()
  for (const item of clothingItems) {
    if (clothingItemTraslations.has(item.Id)) {
      errorAndExit(`Item ${item.USen} of ID ${item.Id} already exists as ${clothingItemTraslations.get(item.Id)!.USen}`)
      return
    }
    clothingItemTraslations.set(item.Id, item)
  }

  const clothingAdjectives = await OpenAeons(clothingCategories.map(name => name + ' Variants'))
  const clothingAdjectiveTranslations = new Map<string, Map<string, AeonTranslations>>() // Map ItemId -> Translation.USen -> actual item
  for (const item of clothingAdjectives) { // item.Id is in form ItemId_Category_VariantId
    const ids = item.Id.split('_')
    if (ids.length !== 3) {
      errorAndExit(`invalid id ${item.Id} for item ${item.USen}`)
      return
    }
    const itemId = ids[0]
    let mp = clothingAdjectiveTranslations.get(itemId)
    if (mp === undefined) {
      mp = new Map()
      clothingAdjectiveTranslations.set(itemId, mp)
    }
    mp.set(item.USen, item)
  }

  // Now, let's roll per clothing item...
  // The code below works! But can we make it a bit, um, less shite?
  for (const [aeonItemId, translations] of clothingItemTraslations) {
    const nookExchangeId = NameToNookExchangeId.get(LowercaseName(translations.USen))
    if (nookExchangeId === undefined) {
      console.log(translations)
      errorAndExit(`Cannot find appropriate ID for ${translations.USen}`)
      return
    }

    const nookExchangeItem = NookExchangeItems.get(nookExchangeId)
    if (!nookExchangeItem) {
      errorAndExit(`No Nook Exchange Item for ID ${nookExchangeId}, ${translations.USen}`)
      return
    }

    // Set the items in question
    for (const locale of Locales) {
      const localTranslations = newTranslations.get(locale) as TranslationsType
      localTranslations.items.set(nookExchangeId, {
        item: CapitalizeName(GetTranslation(translations, locale)),
        adjectives: (() : (string[] | string[][] | undefined) => {
          const variantType = VariantsTypeOf(nookExchangeItem)
          const originalAdjectives = NookExchangeAdjectives.get(nookExchangeId)

          switch (variantType) {
            case VariantsType.OneVariant:
              return undefined
            case VariantsType.SingleAdjective:
              return (originalAdjectives! as string[])
                .map(val => GetTranslation(clothingAdjectiveTranslations.get(aeonItemId)!.get(val) as AeonTranslations, locale))
            case VariantsType.SingleButActuallyDoubleAdjective:
              return [
                (originalAdjectives![0] as string[])
                  .map(val => GetTranslation(clothingAdjectiveTranslations.get(aeonItemId)!.get(val) as AeonTranslations, locale)),
                ['']
              ]
            case VariantsType.DoubleAdjective:
              return (originalAdjectives! as string[][])
                .map(arr => arr.map(val => GetTranslation(clothingAdjectiveTranslations.get(aeonItemId)!.get(val) as AeonTranslations, locale)))
          }
        })()
      })
    }
  }

  console.log(newTranslations.get('es-eu')!.items.get(12986))
  console.log(newTranslations.get('es-eu')!.items.get(12970))
  console.log(newTranslations.get('es-eu')!.items.get(12981))
}

// Opens an Aeon CSV
async function OpenAeon (name : string) : Promise<Array<AeonTranslations>> {
  return AeonParser(`${AEON_CSV_DIR}/${name}.csv`)
}

async function OpenAeons (names : Array<string>) : Promise<AeonTranslations[]> {
  return (await Promise.all(names.map(name => OpenAeon(name)))).reduce((a, b) => a.concat(b))
}

async function ReadVillagerData () {
  // Read villager data
  const villagers = await AeonParser(`${AEON_CSV_DIR}/Villagers.csv`)
  for (const villager of villagers) {
    if (villager.EUes !== villager.USes) {
      console.log(`Villager ${villager.USen} has European Spanish name ${villager.EUes} and American Spanish name ${villager.USes}`)
    }
    if (villager.EUen !== villager.USen) {
      console.log(`Villager ${villager.USen} has European English name ${villager.EUen} and American English name ${villager.USen}`)
    }
    if (villager.EUfr !== villager.USfr) {
      console.log(`Villager ${villager.USen} has European French name ${villager.EUfr} and American French name ${villager.USfr}`)
    }
  }
}

main()
