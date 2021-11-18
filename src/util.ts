// capitalize the first letter of a name
export function CapitalizeName (name : string) : string {
  if (!name) { return '' }
  const first = name.charAt(0)
  if (/[а-яА-ЯЁё]/.test(first)) { return name } // Skip Russian to follow Nook Exchange
  return first.toUpperCase() + name.slice(1)
}

export function LowercaseName (name : string) : string {
  return name.toLocaleLowerCase()
}

export function errorAndExit (message : string) {
  console.error(message)
  process.exit(1)
}
