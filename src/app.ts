import { Convert as ItemsConvert, Items as ItemsType } from './json-parser/Items'
import { Convert as TranslationsConvert, Translations as TranslationsType } from './json-parser/Translations'
import { Convert as AdjectivesConvert, Adjectives as AdjectivesType } from './json-parser/Adjectives'
import { AeonTranslations, GetTranslation, Parser as AeonParser } from './aeon-parser'
import { CapitalizeName, LowercaseName } from './util'
import { writeFile } from 'fs'

const OLD_JSON_DIR = './old-json'
const AEON_CSV_DIR = './aeon-csvs'
const NEW_JSON_DIR = './new-json'
const LOCALES = ['de', 'en-gb', 'es-eu', 'es-us', 'fr-eu', 'fr-us', 'it', 'ja', 'ko', 'nl', 'ru', 'zh-cn', 'zh-tw']

async function main () {
  // Read Nook Exchange data. Mapped using their Nook Exchange ID
  const NookExchangeItems : Map<number, ItemsType> = ItemsConvert.fileToItems(`${OLD_JSON_DIR}/items.json`)
  const NookExchangeAdjectives : Map<number, AdjectivesType> = AdjectivesConvert.fileToAdjectives(`${OLD_JSON_DIR}/variants.json`)

  // Create this map
  const nameToNookExchangeId = new Map<string, number>() // Name must be in all lower case
  for (const [k, v] of NookExchangeItems.entries()) {
    if (nameToNookExchangeId.has(v.name.toLocaleLowerCase())) {
      console.error(`Duplicate item ${v.name} in list of items`)
    }
    nameToNookExchangeId.set(v.name.toLocaleLowerCase(), k)
  }

  // Okay, but what *are* the materials that we'll need translating?
  const allMaterials = new Set<string>()
  for (const item of NookExchangeItems.values()) {
    if (!item.recipe) {
      continue
    }
    const [, , ...requirements] = item.recipe
    for (const item of requirements) {
      allMaterials.add(item[1])
    }
  }

  // All Item Translations go here
  const allItemTranslations = new Map<string, AeonTranslations>() // item.Id -> AeonTranslations
  const nameToAeonId = new Map<string, string>()
  const addTranslations = (translations : AeonTranslations[]) => {
    for (const item of translations) {
      if (allItemTranslations.has(item.Id)) {
        throw new Error(`Item ${item.USen} of ID ${item.Id} already exists as ${allItemTranslations.get(item.Id)!.USen}`)
      }
      allItemTranslations.set(item.Id, item)

      if (nameToAeonId.has(item.USen)) {
        throw new Error(`Item ${item.USen} already exists as ID ${nameToAeonId.get(item.USen)}`)
      }
      nameToAeonId.set(LowercaseName(item.USen), item.Id)
    }
  }

  const nonSpecialCategories = [
    'Art',
    'Bug Models',
    'Bugs',
    'Crafting Items',
    'Dishes',
    'Door Deco',
    'Etc',
    'Event Items',
    'Fencing',
    'Fish Models',
    'Fish',
    'Floors',
    'Fossils',
    'Furniture',
    'Gyroids',
    'Money',
    'Music',
    'Plants',
    'Posters',
    'Rugs',
    'Sea Creatures',
    'Shells',
    'Tools',
    'Turnips',
    'Umbrellas',
    'Wallpaper'
  ]
  addTranslations(await OpenAeons(nonSpecialCategories))

  // All Adjective Translations go here.
  // Map AeonItemId -> Map USen -> Translations object
  const allAdjectiveVariantTranslations = new Map<string, Map<string, AeonTranslations>>()
  const allAdjectivePatternTranslations = new Map<string, Map<string, AeonTranslations>>()

  for (const item of (await OpenAeon('Item Variant Names'))) {
    const ids = item.Id.split('_')
    if (ids.length !== 3) {
      console.error(`invalid id ${item.Id} for item ${item.USen}`)
      return
    }
    const itemId = ids[0] + '_' + ids[1]

    let mp = allAdjectiveVariantTranslations.get(itemId)
    if (mp === undefined) {
      mp = new Map()
      allAdjectiveVariantTranslations.set(itemId, mp)
    }
    mp.set(item.USen, item)
  }

  for (const item of (await OpenAeon('Item Pattern Names'))) {
    const ids = item.Id.split('_')
    if (ids.length !== 3) {
      console.error(`invalid id ${item.Id} for item ${item.USen}`)
      return
    }
    const itemId = ids[0] + '_' + ids[1]

    let mp = allAdjectivePatternTranslations.get(itemId)
    if (mp === undefined) {
      mp = new Map()
      allAdjectivePatternTranslations.set(itemId, mp)
    }
    mp.set(item.USen, item)
  }

  // Special cases: Photos.
  // Because all Photo Items have the same variants, only one Photo Item's variants are encoded in the CSV.
  // That item is Bromide_06426.
  const photoVariants = allAdjectiveVariantTranslations.get('Bromide_06426')!
  for (const photoItem of await OpenAeon('Photos')) {
    addTranslations([photoItem])
    const localVariants = new Map()
    for (const [k, v] of photoVariants) {
      localVariants.set(k, { ...v, Id: photoItem.Id }) // for later...
    }
    allAdjectiveVariantTranslations.set(photoItem.Id, localVariants)
  }

  // Read data from Clothing
  const clothingCategories = ['Accessories',
    'Bags',
    'Bottoms',
    'Caps',
    'Dress-Up',
    'Handbags',
    'Helmets',
    'Shoes',
    'Socks',
    'Tops',
    'Wetsuits'
  ]
  const clothingItems = await OpenAeons(clothingCategories)
  addTranslations(clothingItems)

  const clothingAdjectives = await OpenAeons(clothingCategories.map(name => name + ' Variants'))
  for (const item of clothingAdjectives) { // item.Id is in form ItemId_Category_VariantId
    const ids = item.Id.split('_')
    if (ids.length !== 3) {
      throw new Error(`invalid id ${item.Id} for item ${item.USen}`)
    }
    const itemId = ids[0]
    let mp = allAdjectiveVariantTranslations.get(itemId)
    if (mp === undefined) {
      mp = new Map()
      allAdjectiveVariantTranslations.set(itemId, mp)
    }
    mp.set(item.USen, item)
  }

  // Iterating through the new translations...
  const newTranslations = new Map<string, TranslationsType>()

  for (const locale of LOCALES) {
    console.log(`Working at locale ${locale}`)
    const localTranslations : TranslationsType = {
      items: new Map(),
      materials: new Map()
    }
    newTranslations.set(locale, localTranslations)

    // Let's roll per item
    for (const [aeonItemId, translations] of allItemTranslations) {
      const nookExchangeId = nameToNookExchangeId.get(LowercaseName(translations.USen))
      if (nookExchangeId === undefined) {
        console.error(`Cannot find appropriate Nook Exchange ID for ${translations.USen}, skipping...`)
        continue
      }

      const nookExchangeItem = NookExchangeItems.get(nookExchangeId)
      if (!nookExchangeItem) {
        throw new Error(`No Nook Exchange Item for ID ${nookExchangeId}, ${translations.USen}`)
      }

      localTranslations.items.set(nookExchangeId, {
        item: CapitalizeName(GetTranslation(translations, locale)),
        adjectives: (() : (string[] | [string[], string[]] | undefined) => {
          const originalAdjectives = NookExchangeAdjectives.get(nookExchangeId)

          switch (nookExchangeItem.variants.length) {
            case 0:
              return undefined
            case 1:
              // This can return undefined. Special case: nookExchangeId == 2374 (Lost Item)
              // Reports variants = [3] but the CSV files say nothing about such variants!
              return originalAdjectives?.map(val =>
                GetTranslation(allAdjectiveVariantTranslations
                  .get(aeonItemId)!
                  .get(val as string) as AeonTranslations,
                locale))
            case 2: {
              const variantTranslations = originalAdjectives![0] as string[]
              const patternTranslations = originalAdjectives![1] as string[]
              return [
                variantTranslations.length <= 1
                  ? ['']
                  : (variantTranslations).map(val => {
                      return GetTranslation(allAdjectiveVariantTranslations.get(aeonItemId)!.get(val) as AeonTranslations, locale)
                    }),
                patternTranslations.length <= 1
                  ? ['']
                  : (patternTranslations).map(val => {
                      return GetTranslation(allAdjectivePatternTranslations.get(aeonItemId)!.get(val) as AeonTranslations, locale)
                    })
              ]
            }
          }
        })()
      })
    }

    // Let's roll per material
    for (const material of allMaterials) {
      localTranslations.materials.set(material, CapitalizeName(GetTranslation(allItemTranslations.get(nameToAeonId.get(LowercaseName(material))!)!, locale)))
    }

    // And now, let's print per locale!
    writeFile(
      `${NEW_JSON_DIR}/${locale}.json`,
      TranslationsConvert.translationsToJson(localTranslations),
      err => { if (err) { throw (err) } }
    )
  }
}

// Opens an Aeon CSV
async function OpenAeon (name : string) : Promise<Array<AeonTranslations>> {
  return AeonParser(`${AEON_CSV_DIR}/${name}.csv`)
}

async function OpenAeons (names : Array<string>) : Promise<AeonTranslations[]> {
  return (await Promise.all(names.map(name => OpenAeon(name)))).reduce((a, b) => a.concat(b))
}

main()
