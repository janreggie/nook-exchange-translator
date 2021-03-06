// To parse this data:
//
//   import { Convert } from "./file";
//
//   const items = Convert.toItems(json);
//
// These functions will throw an error if the JSON doesn't
// match the expected interface, even if the JSON is valid.

import { readFileSync } from 'fs'

export interface Item {
  id: number;
  name: string;
  category: string;
  variants: [] | [number] | [number, number];
  image: string[] | string;
  flags: number;
  source?: string;
  buy?: number;
  sell?: number;
  tags?: string[];
  recipe?: [number, string, ...Array<[number, string]>];
  kitCost?: number;
}

// Converts JSON strings to/from your types
// and asserts the results of JSON.parse at runtime
export class Convert {
  // Returns the items mapped using their IDs
  public static fileToItems (filename : string) : Map<number, Item> {
    return Convert.toItems(readFileSync(filename).toString())
  }

  public static toItems (json: string): Map<number, Item> {
    return oldToNew(cast(JSON.parse(json), a(r('Items'))))
  }

  public static itemsToJson (value: Map<number, Item>): string {
    return JSON.stringify(uncast(newToOld(value), a(r('Items'))), null, 2)
  }
}

function oldToNew (items : Item[]) : Map<number, Item> {
  const result = new Map<number, Item>()
  items.forEach(item => {
    if (result.has(item.id)) {
      throw new Error(`item ID ${item.id} already exists as ${result.get(item.id)?.name}`)
    }
    result.set(item.id, item)
  })
  return result
}

function newToOld (items : Map<number, Item>) : Item[] {
  const result = Array.from(items.values())
  return result.sort((a, b) => a.name.localeCompare(b.name))
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

function r (name: string) {
  return { ref: name }
}

const typeMap: any = {
  Items: o([
    { json: 'id', js: 'id', typ: 0 },
    { json: 'name', js: 'name', typ: '' },
    { json: 'category', js: 'category', typ: '' },
    { json: 'variants', js: 'variants', typ: a(0) },
    { json: 'image', js: 'image', typ: u(a(''), '') },
    { json: 'flags', js: 'flags', typ: 0 },
    { json: 'source', js: 'source', typ: u(undefined, '') },
    { json: 'buy', js: 'buy', typ: u(undefined, 0) },
    { json: 'sell', js: 'sell', typ: u(undefined, 0) },
    { json: 'tags', js: 'tags', typ: u(undefined, a('')) },
    { json: 'recipe', js: 'recipe', typ: u(undefined, a(u(a(u(0, '')), 0, ''))) },
    { json: 'kitCost', js: 'kitCost', typ: u(undefined, 0) }
  ], false)
}
