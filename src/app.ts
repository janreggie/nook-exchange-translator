import { Convert as ItemsConvert, Item as ItemType } from './json-parser/Items'
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
  const NookExchangeItems : Map<number, ItemType> = ItemsConvert.fileToItems(`${OLD_JSON_DIR}/items.json`)
  const NookExchangeAdjectives : Map<number, AdjectivesType> = AdjectivesConvert.fileToAdjectives(`${OLD_JSON_DIR}/variants.json`)
  const nameToNookExchangeId = new Map<string, number>()
  for (const [k, v] of NookExchangeItems.entries()) {
    if (nameToNookExchangeId.has(v.name.toLocaleLowerCase())) {
      console.error(`Duplicate item ${v.name} in list of items`)
    }
    nameToNookExchangeId.set(LowercaseName(v.name), k)
  }

  const allMaterials = new Set<string>() // All material Items.
  for (const item of NookExchangeItems.values()) {
    if (!item.recipe) {
      continue
    }
    const [, , ...requirements] = item.recipe
    for (const item of requirements) {
      allMaterials.add(item[1])
    }
  }

  const allItemTranslations = new Map<string, AeonTranslations>() // Aeon ID -> AeonTranslations
  const nameToAeonId = new Map<string, string>() // lowercaseName -> AeonTranslations
  const insertAeonTranslation = (translation : AeonTranslations) => {
    if (allItemTranslations.has(translation.Id)) {
      throw new Error(`Item ${translation.USen} of ID ${translation.Id} already exists as ${allItemTranslations.get(translation.Id)!.USen}`)
    }
    allItemTranslations.set(translation.Id, translation)

    const name = LowercaseName(translation.USen)
    if (nameToAeonId.has(name)) {
      throw new Error(`In inserting ${translation.Id}, item ${name} already exists as ID ${nameToAeonId.get(name)}`)
    }
    nameToAeonId.set(name, translation.Id)
  }
  const insertAeonTranslations = (translations : AeonTranslations[]) => { translations.forEach(item => insertAeonTranslation(item)) }

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
  insertAeonTranslations(await OpenAeons(nonSpecialCategories))

  // All Adjective Translations go here.
  // Map AeonItemId -> Translation.USen -> Translations object
  const allAdjectiveVariantTranslations = new Map<string, Map<string, AeonTranslations>>()
  const allAdjectivePatternTranslations = new Map<string, Map<string, AeonTranslations>>()

  for (const item of (await OpenAeon('Item Variant Names'))) {
    const ids = item.Id.split('_')
    if (ids.length !== 3) {
      throw new Error(`invalid id ${item.Id} for item ${item.USen}`)
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
    insertAeonTranslation(photoItem)
    const localVariants = new Map()
    for (const [k, v] of photoVariants) {
      localVariants.set(k, { ...v, Id: photoItem.Id }) // Override Id for this particular photoItem
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
  insertAeonTranslations(await OpenAeons(clothingCategories))

  // All Clothing Items have "variants", not "patterns".
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

  // Write down the new Translations
  for (const locale of LOCALES) {
    console.log(`Working at locale ${locale}`)
    const localize = (translations : AeonTranslations) => CapitalizeName(GetTranslation(translations, locale))
    const localTranslations : TranslationsType = {
      items: new Map(),
      materials: new Map()
    }

    // Iterate for every Item that exists both in the Aeon CSVs and Nook Exchange JSON
    for (const [aeonItemId, aeonTranslations] of allItemTranslations) {
      const nookExchangeId = nameToNookExchangeId.get(LowercaseName(aeonTranslations.USen))
      if (nookExchangeId === undefined) {
        console.error(`Cannot find appropriate Nook Exchange ID for ${aeonTranslations.USen}, skipping...`)
        continue
      }

      const nookExchangeItem = NookExchangeItems.get(nookExchangeId)
      if (!nookExchangeItem) {
        throw new Error(`No Nook Exchange Item for ID ${nookExchangeId}, ${aeonTranslations.USen}`)
      }

      const localizedItem = localize(aeonTranslations)
      const localizedAdjectives = (() : (AdjectivesType | undefined) => {
        const originalAdjectives = NookExchangeAdjectives.get(nookExchangeId)
        if (originalAdjectives === undefined) { return undefined }

        switch (nookExchangeItem.variants.length) {
          case 0:
            return undefined

          case 1: {
            const aeonVariants = allAdjectiveVariantTranslations.get(aeonItemId)!
            return (originalAdjectives as string[]).map(variant => localize(aeonVariants.get(variant)!))
          }

          case 2: {
            const originalVariants = (originalAdjectives as [string[], string[]])[0]
            const originalPatterns = (originalAdjectives as [string[], string[]])[1]
            const aeonVariants = allAdjectiveVariantTranslations.get(aeonItemId)!
            const aeonPatterns = allAdjectivePatternTranslations.get(aeonItemId)!
            return [
              originalVariants.length === 1 ? [''] : (originalVariants).map(variant => localize(aeonVariants.get(variant)!)),
              originalPatterns.length === 1 ? [''] : (originalPatterns).map(pattern => localize(aeonPatterns.get(pattern)!))
            ]
          }
        }
      })()

      localTranslations.items.set(nookExchangeId, {
        item: localizedItem,
        adjectives: localizedAdjectives
      })
    }

    // Let's roll per material
    for (const material of allMaterials) {
      const aeonId = nameToAeonId.get(LowercaseName(material))!
      localTranslations.materials.set(material, localize(allItemTranslations.get(aeonId)!))
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
