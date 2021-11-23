import { parseFile } from 'fast-csv'

export interface AeonTranslations {
  Id: string;
  EUde: string;
  EUen: string;
  EUit: string;
  EUnl: string;
  EUru: string;
  EUfr: string;
  EUes: string;
  USen: string;
  USfr: string;
  USes: string;
  JPja: string;
  KRko: string;
  TWzh: string;
  CNzh: string;
}

export function GetTranslation (translations : AeonTranslations, locale: string) : string {
  switch (locale) {
    case 'de': return translations.EUde
    case 'en-gb': return translations.EUen
    case 'es-eu': return translations.EUes
    case 'es-us': return translations.USes
    case 'fr-eu': return translations.EUfr
    case 'fr-us': return translations.USfr
    case 'it': return translations.EUit
    case 'ja': return translations.JPja
    case 'ko': return translations.KRko
    case 'nl': return translations.EUnl
    case 'ru': return translations.EUru
    case 'zh-cn': return translations.CNzh
    case 'zh-tw': return translations.TWzh
    default: return ''
  }
}

export async function Parser (filename : string) : Promise<AeonTranslations[]> {
  return new Promise((resolve, reject) => {
    const result : AeonTranslations[] = []
    parseFile(filename, { headers: true })
      .on('error', (error : any) => reject(error))
      .on('data', (row : AeonTranslations) => result.push(row))
      .on('end', () => resolve(result))
  })
}
