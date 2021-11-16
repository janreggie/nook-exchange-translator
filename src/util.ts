// capitalize the first letter of a name
export function CapitalizeName (name : string) : string {
  if (!name) { return '' }
  if (name >= 'a' && name <= 'z') {
    const first = name.charAt(0)
    return first.toUpperCase() + name.slice(1)
  }
  return name
}

export function LowercaseName(name : string) : string {
  return name.toLocaleLowerCase()
}

export function errorAndExit (message : string) {
  console.error(message)
  process.exit(1)
}
