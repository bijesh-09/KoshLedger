// The contact footer is rendered by every page and keeps this id, so "Contact"
// in the navbar can scroll the *current* page instead of navigating away.
export const CONTACT_SECTION_ID = "contact"

export function scrollToContact() {
  const section = document.getElementById(CONTACT_SECTION_ID)
  if (!section) return false

  section.scrollIntoView({ behavior: "smooth", block: "start" })
  return true
}
