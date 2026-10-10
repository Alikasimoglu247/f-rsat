/** A bounded personal research policy, never a bulk reuse licence. */
export const researchHosts = new Set([
  "www.genccity.com",
  "www.gayrimenkulakgun.com",
  "interestingrealestate.com",
  "www.tcmb.gov.tr",
  "tcmb.gov.tr",
  "www.silivri.bel.tr",
  "www.uab.gov.tr",
  "www.afad.gov.tr",
  "www.turyap.com.tr",
  "www.togg.com.tr",
  "www.otomol.com",
]);
const prohibited = [
  "sahibinden.com",
  "arabam.com",
  "emlakjet.com",
  "hepsiemlak.com",
  "remax.com.tr",
];
export function safeResearchUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === "443") &&
      researchHosts.has(url.hostname) &&
      !prohibited.some(
        (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
      )
    );
  } catch {
    return false;
  }
}
export function robotsAllows(
  body: string,
  value: string,
  agent = "FirsatRadarResearch",
) {
  type Group = { agents: string[]; rules: { allow: boolean; path: string }[] };
  const groups: Group[] = [];
  let group: Group | null = null;
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim(),
      colon = line.indexOf(":");
    if (colon < 0) continue;
    const name = line.slice(0, colon).trim().toLowerCase(),
      value = line.slice(colon + 1).trim();
    if (name === "user-agent") {
      if (!group || group.rules.length) {
        group = { agents: [], rules: [] };
        groups.push(group);
      }
      group.agents.push(value.toLowerCase());
    } else if (group && (name === "allow" || name === "disallow") && value) {
      group.rules.push({ allow: name === "allow", path: value });
    }
  }
  const specificity = (group: Group) =>
    Math.max(
      0,
      ...group.agents
        .filter((a) => a !== "*" && agent.toLowerCase().includes(a))
        .map((a) => a.length),
    );
  const longest = Math.max(0, ...groups.map(specificity));
  const specific = longest
    ? groups.filter((g) => specificity(g) === longest)
    : [];
  const selected = specific.length
    ? specific
    : groups.filter((g) => g.agents.includes("*"));
  const url = new URL(value),
    path = url.pathname + url.search;
  const matching = selected
    .flatMap((g) => g.rules)
    .filter((r) => {
      const expression = r.path
        .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*")
        .replace(/\\\$$/, "$");
      return new RegExp(`^${expression}`).test(path);
    })
    .sort(
      (a, b) =>
        b.path.replace(/\*/g, "").length - a.path.replace(/\*/g, "").length ||
        Number(b.allow) - Number(a.allow),
    );
  return matching[0]?.allow ?? true;
}
export function termsRestrictAutomation(text: string) {
  const normalized = text.replace(/\s+/g, " ").toLocaleLowerCase("tr-TR");
  return (
    /(?:yazılı (?:izin|onay)|yazılı izni|yazılı onayı).{0,550}(?:işlenemez|kopyalanamaz|depolanması|veri (?:çekilmesi|toplama)|yasaktır)/u.test(
      normalized,
    ) ||
    /(?:otomatik|robot|veri madenciliği|toplu veri|kazıma).{0,100}(?:yasak|izin verilmez|yapılamaz|izin olmadan|izinsiz)/u.test(
      normalized,
    ) ||
    /(?:yasak|izinsiz|izin olmadan).{0,100}(?:otomatik|robot|veri madenciliği|toplu veri|kazıma)/u.test(
      normalized,
    ) ||
    /(?:scrap(?:ing|e)|crawl(?:ing)?|data mining|automated (?:access|collection)|bulk download).{0,100}(?:prohibit|not (?:allowed|permitted)|without (?:prior )?(?:written )?permission)/i.test(
      normalized,
    ) ||
    /(?:prohibit|not (?:allowed|permitted)|without (?:prior )?(?:written )?permission).{0,100}(?:scrap(?:ing|e)|crawl(?:ing)?|data mining|automated (?:access|collection)|bulk download)/i.test(
      normalized,
    )
  );
}

/** Publishers can reserve AI grounding independently of ordinary crawl rules. */
export function contentSignalAllows(body: string) {
  return !body.split(/\r?\n/).some((raw) => {
    const line = raw.replace(/#.*$/, "").trim();
    return (
      /^content-signal\s*:/i.test(line) &&
      /(?:^|[,\s:])ai-input\s*=\s*no(?:$|[,\s])/i.test(line)
    );
  });
}
export function accessChallenge(body: string) {
  // Embedded enquiry forms on otherwise public pages are not a page access challenge.
  return (
    /(?:verify you are human|checking your browser|attention required!\s*\|\s*cloudflare|cf-chl-|access denied|bot verification)/i.test(
      body,
    ) ||
    (/^(?![\s\S]*itemprop=["']price["'])[\s\S]*$/i.test(body) &&
      /<title>[^<]*(?:captcha|güvenlik doğrulaması|erişim engellendi)/i.test(
        body,
      ))
  );
}
