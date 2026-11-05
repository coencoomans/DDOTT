/*
 * Instellingen voor het Onderzoekersportaal.
 *
 * Vul hier de gegevens van je Supabase-project in (zie HANDLEIDING-PORTAAL.md, stap 4).
 * Deze sleutel mag openbaar zijn: hij geeft zelf geen toegang tot documenten.
 * Gebruik hier NOOIT de "secret" of "service_role" sleutel!
 */
window.DDOTT_PORTAAL = {
  // Project URL, bijvoorbeeld 'https://abcdefghijkl.supabase.co'
  supabaseUrl: 'https://wnhtjmzqwvinpgvlxxxl.supabase.co',

  // Publishable key (begint met 'sb_publishable_') of de oude 'anon public' key
  supabaseKey: 'sb_publishable_4PdoyCgeeGdjn1qNzgcBVg_1I_WTiwf',

  // Het gedeelde account voor onderzoekers. Het wachtwoord van dit account IS de toegangscode.
  onderzoekerEmail: 'onderzoeker@ddott.nl',

  // Naam van de opslagmap (bucket) in Supabase. Niet wijzigen tenzij je de SQL ook aanpast.
  bucket: 'documenten',

  // Maximale bestandsgrootte in MB (het gratis Supabase-abonnement staat max. 50 MB toe)
  maxBestandMB: 50
};
