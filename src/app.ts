import { Convert as ItemsConvert, Items as ItemsType, VariantsType, VariantsTypeOf } from './json-parser/Items'
import { Convert as TranslationsConvert, Translations as TranslationsType } from './json-parser/Translations'
import { Convert as AdjectivesConvert, Adjectives as AdjectivesType } from './json-parser/Adjectives'
import { AeonTranslations, GetTranslation, Parser as AeonParser } from './aeon-parser'
import { CapitalizeName, LowercaseName } from './util'
import { writeFile } from 'fs'

const OLD_JSON_DIR = './old-json'
const AEON_CSV_DIR = './aeon-csvs'
const NEW_JSON_DIR = './new-json'

const Locales = ['de', 'en-gb', 'es-eu', 'es-us', 'fr-eu', 'fr-us', 'it', 'ja', 'ko', 'nl', 'ru', 'zh-cn', 'zh-tw']

// Read Nook Exchange data
const NookExchangeItems : Map<number, ItemsType> = ItemsConvert.fileToItems(`${OLD_JSON_DIR}/items.json`)
const NookExchangeAdjectives : Map<number, AdjectivesType> = AdjectivesConvert.fileToAdjectives(`${OLD_JSON_DIR}/variants.json`)
const NameToNookExchangeId = new Map<string, number>() // Name must be in all lower case
for (const [k, v] of NookExchangeItems.entries()) {
  if (NameToNookExchangeId.has(v.name.toLocaleLowerCase())) {
    console.error(`Duplicate item ${v.name} in list of items`)
  }
  NameToNookExchangeId.set(v.name.toLocaleLowerCase(), k)
}

// Read Nook Exchange translations
const OldTranslations = new Map<string, TranslationsType>()
for (const locale of Locales) {
  OldTranslations.set(locale, TranslationsConvert.fileToTranslations(`${OLD_JSON_DIR}/translations/${locale}.json`))
}

async function main () {
  // // Read some items to see if things go well
  // for (const id of [13018, 4463, 12543, 3449]) {
  //   console.log(`For ID ${id}`)
  //   console.log('Item: ', NookExchangeItems.get(id))
  //   console.log('Adjectives: ', NookExchangeAdjectives.get(id))
  //   console.log('es-eu translations: ', OldTranslations.get('es-eu')!.items.get(id))
  //   console.log()
  // }

  // Okay, but what *are* the materials that we'll need translating?
  const allMaterials = new Set<string>()
  for (const item of NookExchangeItems.values()) {
    if (!item.recipe) {
      continue
    }

    // The recipes are stored from length two onwards
    const requirements = item.recipe.slice(2) as Array<[number, string]>
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
        console.error(`Item ${item.USen} of ID ${item.Id} already exists as ${allItemTranslations.get(item.Id)!.USen}`)
        process.exit(1)
      }
      allItemTranslations.set(item.Id, item)

      if (nameToAeonId.has(item.USen)) {
        console.error(`Item ${item.USen} already exists as ID ${nameToAeonId.get(item.USen)}`)
        process.exit(1)
      }
      nameToAeonId.set(LowercaseName(item.USen), item.Id)
    }
  }

  // All Adjective Translations go here.
  // Map AeonItemId -> Map USen -> Translations object
  const allAdjectiveVariantTranslations = new Map<string, Map<string, AeonTranslations>>()
  const allAdjectivePatternTranslations = new Map<string, Map<string, AeonTranslations>>()

  const nonSpecialCategories = [
    'Bug Models',
    'Dishes',
    'Door Deco',
    'Fish Models',
    'Floors',
    'Fossils',
    'Furniture',
    'Gyroids',
    'Music',
    'Posters',
    'Rugs',
    'Umbrellas',
    'Wallpaper'
  ]
  addTranslations(await OpenAeons(nonSpecialCategories))

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

  // Special cases: Some items are plural, others aren't
  const somePluralCategories = [
    'Crafting Items', // TODO: Reconcile because some Crafting Items have similar English names
    'Etc', // TODO: Reconcile, some use plural while others use singular
    'Event Items', // TODO: Some use plural others use singular
    'Fencing', // TODO: Reconcile: use singular
    'Money',
    'Plants',
    'Shells',
    'Tools',
    'Turnips'
  ]
  addTranslations(await OpenAeons(somePluralCategories))

  const critters = [
    'Bugs',
    'Fish',
    'Sea Creatures'
  ]
  addTranslations(await OpenAeons(critters))

  // Special cases: Photos
  const photoVariants = allAdjectiveVariantTranslations.get('Bromide_06426')! // The only one whose value is in the JSON
  for (const photoItem of await OpenAeon('Photos')) {
    addTranslations([photoItem])
    const localVariants = new Map()
    for (const [k, v] of photoVariants) {
      localVariants.set(k, { ...v, Id: photoItem.Id }) // for later...
    }
    allAdjectiveVariantTranslations.set(photoItem.Id, localVariants)
  }

  // Special cases: Art
  addTranslations(await OpenAeon('Art'))

  // Read data from Clothing
  const clothingCategories = ['Accessories', 'Bags', 'Bottoms', 'Caps', 'Dress-Up', 'Handbags', 'Helmets', 'Shoes', 'Socks', 'Tops', 'Wetsuits']
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

  for (const locale of Locales) {
    console.log(`Working at locale ${locale}`)
    const localTranslations : TranslationsType = {
      items: new Map(),
      materials: new Map()
    }
    newTranslations.set(locale, localTranslations)

    // Let's roll per item
    for (const [aeonItemId, translations] of allItemTranslations) {
      const nookExchangeId = NameToNookExchangeId.get(LowercaseName(translations.USen))
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
        adjectives: (() : (string[] | string[][] | undefined) => {
          const variantType = VariantsTypeOf(nookExchangeItem)
          const originalAdjectives = NookExchangeAdjectives.get(nookExchangeId)

          switch (variantType) {
            case VariantsType.OneVariant:
              return undefined
            case VariantsType.SingleAdjective:
              return originalAdjectives
                ?.map(val =>
                  GetTranslation(allAdjectiveVariantTranslations
                    .get(aeonItemId)!
                    .get(val as string) as AeonTranslations,
                  locale))
            case VariantsType.DoubleAdjective: {
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
