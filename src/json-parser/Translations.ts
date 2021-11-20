// To parse this data:
//
//   import { Convert, Translations } from "./file";
//
//   const translations = Convert.toTranslations(json);
//
// These functions will throw an error if the JSON doesn't
// match the expected interface, even if the JSON is valid.

import { readFileSync } from 'fs'

interface Translation {
  item: string
  adjectives?: [string[], string[]] | string[]
}

export interface Translations {
  items: Map<number, Translation> // items[item ID] = Translation object
  materials: Map<string, string> // materials[name in english] = name in some language
}

// Interface generated by quicktype. Modified by me.
interface rawTranslations {
    items: { [key: string]: [string, (string[] | [string[], string[]])?] };
    materials: { [key: string]: string };
}

// Converts JSON strings to/from your types
// and asserts the results of JSON.parse at runtime
export class Convert {
  public static fileToTranslations (filename : string) : Translations {
    return Convert.toTranslations(readFileSync(filename).toString())
  }

  public static toTranslations (json: string): Translations {
    return oldToNew(cast(JSON.parse(json), r('Translations')))
  }

  public static translationsToJson (value: Translations): string {
    return JSON.stringify(uncast(newToOld(value), r('Translations')), null, 2)
  }
}

function oldToNew (value : rawTranslations) : Translations {
  // Parse items
  const items = new Map<number, Translation>()
  for (const [k, v] of Object.entries(value.items)) {
    items.set(Number(k), {
      item: v[0],
      adjectives: v[1]
    })
  }

  // Parse materials
  const materials = new Map<string, string>()
  for (const [k, v] of Object.entries(value.materials)) {
    materials.set(k, v)
  }

  return { items, materials }
}

function newToOld (value : Translations) : rawTranslations {
  // Parse items
  const items : { [key: string]: [string, (string[] | [string[], string[]])?] } = {}
  for (const [k, v] of value.items.entries()) {
    items[k] = v.adjectives ? [v.item, v.adjectives] : [v.item]
  }

  // Parse materials
  const materials : { [key: string]: string } = {}
  for (const [k, v] of value.materials.entries()) {
    materials[k] = v
  }

  return { items, materials }
}

function invalidValue (typ: any, val: any, key: any = ''): never {
  if (key) {
    throw Error(`Invalid value for key "${key}". Expected type ${JSON.stringify(typ)} but got ${JSON.stringify(val)}`)
  }
  throw Error(`Invalid value ${JSON.stringify(val)} for type ${JSON.stringify(typ)}`)
}

function jsonToJSProps (typ: any): any {
  if (typ.jsonToJS === undefined) {
    const map: any = {}
    typ.props.forEach((p: any) => { map[p.json] = { key: p.js, typ: p.typ } })
    typ.jsonToJS = map
  }
  return typ.jsonToJS
}

function jsToJSONProps (typ: any): any {
  if (typ.jsToJSON === undefined) {
    const map: any = {}
    typ.props.forEach((p: any) => { map[p.js] = { key: p.json, typ: p.typ } })
    typ.jsToJSON = map
  }
  return typ.jsToJSON
}

function transform (val: any, typ: any, getProps: any, key: any = ''): any {
  function transformPrimitive (typ: string, val: any): any {
    if (typeof typ === typeof val) return val
    return invalidValue(typ, val, key)
  }

  function transformUnion (typs: any[], val: any): any {
    // val must validate against one typ in typs
    const l = typs.length
    for (let i = 0; i < l; i++) {
      const typ = typs[i]
      try {
        return transform(val, typ, getProps)
      } catch (_) {}
    }
    return invalidValue(typs, val)
  }

  function transformEnum (cases: string[], val: any): any {
    if (cases.indexOf(val) !== -1) return val
    return invalidValue(cases, val)
  }

  function transformArray (typ: any, val: any): any {
    // val must be an array with no invalid elements
    if (!Array.isArray(val)) return invalidValue('array', val)
    return val.map(el => transform(el, typ, getProps))
  }

  function transformDate (val: any): any {
    if (val === null) {
      return null
    }
    const d = new Date(val)
    if (isNaN(d.valueOf())) {
      return invalidValue('Date', val)
    }
    return d
  }

  function transformObject (props: { [k: string]: any }, additional: any, val: any): any {
    if (val === null || typeof val !== 'object' || Array.isArray(val)) {
      return invalidValue('object', val)
    }
    const result: any = {}
    Object.getOwnPropertyNames(props).forEach(key => {
      const prop = props[key]
      const v = Object.prototype.hasOwnProperty.call(val, key) ? val[key] : undefined
      result[prop.key] = transform(v, prop.typ, getProps, prop.key)
    })
    Object.getOwnPropertyNames(val).forEach(key => {
      if (!Object.prototype.hasOwnProperty.call(props, key)) {
        result[key] = transform(val[key], additional, getProps, key)
      }
    })
    return result
  }

  if (typ === 'any') return val
  if (typ === null) {
    if (val === null) return val
    return invalidValue(typ, val)
  }
  if (typ === false) return invalidValue(typ, val)
  while (typeof typ === 'object' && typ.ref !== undefined) {
    typ = typeMap[typ.ref]
  }
  if (Array.isArray(typ)) return transformEnum(typ, val)
  if (typeof typ === 'object') {
    return Object.prototype.hasOwnProperty.call(typ, 'unionMembers')
      ? transformUnion(typ.unionMembers, val)
      : Object.prototype.hasOwnProperty.call(typ, 'arrayItems')
        ? transformArray(typ.arrayItems, val)
        : Object.prototype.hasOwnProperty.call(typ, 'props')
          ? transformObject(getProps(typ), typ.additional, val)
          : invalidValue(typ, val)
  }
  // Numbers can be parsed by Date but shouldn't be.
  if (typ === Date && typeof val !== 'number') return transformDate(val)
  return transformPrimitive(typ, val)
}

function cast<T> (val: any, typ: any): T {
  return transform(val, typ, jsonToJSProps)
}

function uncast<T> (val: T, typ: any): any {
  return transform(val, typ, jsToJSONProps)
}

function a (typ: any) {
  return { arrayItems: typ }
}

function u (...typs: any[]) {
  return { unionMembers: typs }
}

function o (props: any[], additional: any) {
  return { props, additional }
}

function m (additional: any) {
  return { props: [], additional }
}

function r (name: string) {
  return { ref: name }
}

const typeMap: any = {
  Translations: o([
    { json: 'items', js: 'items', typ: m(a(u(a(u(a(''), '')), ''))) },
    { json: 'materials', js: 'materials', typ: m('') }
  ], false)
}
