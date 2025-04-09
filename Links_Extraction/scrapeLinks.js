// const { chromium } = require("playwright");

// const BASE_URLS = [
//   "https://docs.capillarytech.com/docs/introduction",
//   "https://docs.capillarytech.com/reference/apioverview"
// ];

// const TYPE1_PREFIX = "https://docs.capillarytech.com/docs/";
// const TYPE2_PREFIX = "https://docs.capillarytech.com/reference/";

// async function getNavLinks(url) {
//   const browser = await chromium.launch({ headless: true });
//   const page = await browser.newPage();

//   console.log(`Scraping: ${url}`);
//   await page.goto(url, { waitUntil: "networkidle" });
//   await page.waitForTimeout(5000); // Wait for dynamic content to load

//   const links = await page.$$eval("a[href]", (elements) =>
//     elements.map((el) => el.href)
//   );

//   await browser.close();

//   const filtered = links.filter((link) =>
//     link.startsWith(TYPE1_PREFIX) || link.startsWith(TYPE2_PREFIX)
//   );

//   return [...new Set(filtered)]; // Remove duplicates
// }

// (async () => {
//   let allLinks = [];

//   for (const url of BASE_URLS) {
//     const links = await getNavLinks(url);
//     allLinks.push(...links);
//   }

//   // Remove duplicates globally
//   const uniqueLinks = [...new Set(allLinks)].sort();

//   console.log("\n📄 Extracted Links:");
//   uniqueLinks.forEach((link) => console.log(link));

//   // Optional: Save to file
//   const fs = require("fs");
//   fs.writeFileSync("capillary_doc_links.txt", uniqueLinks.join("\n"), "utf-8");
// })();


const { chromium } = require("playwright");
const fs = require("fs");

const BASE_URLS = [
  {
    label: "User Docs",
    entryUrl: "https://docs.capillarytech.com/docs/introduction"
  },
  {
    label: "Developer Docs",
    entryUrl: "https://docs.capillarytech.com/reference/apioverview"
  }
];

const TYPE1_PREFIX = "https://docs.capillarytech.com/docs/";
const TYPE2_PREFIX = "https://docs.capillarytech.com/reference/";

async function getStructuredLinks(entryUrl) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  console.log(`Visiting: ${entryUrl}`);
  await page.goto(entryUrl, { waitUntil: "networkidle" });

  // Try the original selector that worked
  try {
    await page.waitForSelector("aside[class*=theme-doc-sidebar-container]", { timeout: 20000 });
  } catch (err) {
    console.error("❌ Sidebar did not load. Maybe hydration issue or selector changed.");
    await browser.close();
    return {};
  }

  const links = await page.evaluate(({ TYPE1_PREFIX, TYPE2_PREFIX }) => {
    const sidebar = document.querySelector("aside[class*=theme-doc-sidebar-container]");
    const linkData = {};

    let currentSection = "Uncategorized";

    const items = sidebar.querySelectorAll("li");

    items.forEach((li) => {
      const sectionHeader = li.querySelector(".menu__link--sublist");
      const linkEl = li.querySelector("a.menu__link:not(.menu__link--sublist)");

      if (sectionHeader) {
        currentSection = sectionHeader.innerText.trim();
        if (!linkData[currentSection]) linkData[currentSection] = [];
      }

      if (linkEl) {
        const href = linkEl.href;
        if (href.startsWith(TYPE1_PREFIX) || href.startsWith(TYPE2_PREFIX)) {
          if (!linkData[currentSection]) linkData[currentSection] = [];
          linkData[currentSection].push(href);
        }
      }
    });

    return linkData;
  }, { TYPE1_PREFIX, TYPE2_PREFIX });

  await browser.close();
  return links;
}

(async () => {
  let finalLinks = {};

  for (const { label, entryUrl } of BASE_URLS) {
    console.log(`🟦 Scraping from: ${label} (${entryUrl})`);
    const sectionData = await getStructuredLinks(entryUrl);

    for (const [section, links] of Object.entries(sectionData)) {
      if (!finalLinks[section]) finalLinks[section] = new Set();
      links.forEach(link => finalLinks[section].add(link));
    }
  }

  const cleaned = {};
  for (const [section, links] of Object.entries(finalLinks)) {
    cleaned[section] = Array.from(links).sort();
  }

  fs.writeFileSync("capillary_structured_links.json", JSON.stringify(cleaned, null, 2));
  console.log("✅ Structured links written to capillary_structured_links.json");
})();


