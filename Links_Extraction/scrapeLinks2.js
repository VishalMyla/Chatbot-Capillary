const { chromium } = require("playwright");
const fs = require("fs");

const BASE_URLS = [
  "https://docs.capillarytech.com/docs/introduction",
  "https://docs.capillarytech.com/reference/apioverview"
];

async function scrapeNavLinks(url) {
  const browser = await chromium.launch({ headless: false }); // Set to false for debugging
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log(`Scraping: ${url}`);
  
  try {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    
    // Wait for the navigation sidebar to load
    await page.waitForSelector("nav.rm-Sidebar", { timeout: 10000 });
    
    // Additional wait to ensure dynamic content is fully loaded
    await page.waitForTimeout(3000);
    
    // Take a screenshot to help with debugging
    await page.screenshot({ path: `screenshot-${url.split('/').pop()}.png` });
    
    // Extract the nav structure using the correct selectors based on the DOM you shared
    const navStructure = await page.evaluate(() => {
      const structure = {};
      
      // Find all sections in the navigation
      const sections = document.querySelectorAll("nav.rm-Sidebar > div > section");
      
      sections.forEach((section, index) => {
        // Get section title (if it exists)
        const sectionHeading = section.querySelector("h1, h2, h3");
        let sectionName = sectionHeading ? sectionHeading.textContent.trim() : `Section ${index + 1}`;
        
        // If section name is empty, try to use the first link as the section name
        if (!sectionName || sectionName === "") {
          const firstLink = section.querySelector("li > a");
          if (firstLink) {
            sectionName = firstLink.textContent.trim();
          }
        }
        
        // Initialize the section
        structure[sectionName] = [];
        
        // Get all links in this section
        const links = section.querySelectorAll("li > a");
        
        links.forEach(link => {
          const href = link.getAttribute("href");
          
          // Only include links that have the proper format
          if (href && (href.startsWith("/docs/") || href.startsWith("/reference/"))) {
            const fullUrl = new URL(href, window.location.origin).href;
            
            structure[sectionName].push({
              title: link.textContent.trim(),
              url: fullUrl
            });
          }
        });
        
        // Remove sections with no links
        if (structure[sectionName].length === 0) {
          delete structure[sectionName];
        }
      });
      
      return structure;
    });

    console.log(`Found ${Object.keys(navStructure).length} sections in ${url}`);
    
    // Log what was found
    for (const [section, links] of Object.entries(navStructure)) {
      console.log(`  - ${section}: ${links.length} links`);
    }
    
    await browser.close();
    return navStructure;
    
  } catch (error) {
    console.error(`Error scraping ${url}:`, error);
    await browser.close();
    return {};
  }
}

// Special function to handle expandable items
async function expandAndScrapeNavItems(url) {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log(`Expanding and scraping: ${url}`);
  
  try {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("nav.rm-Sidebar", { timeout: 10000 });
    await page.waitForTimeout(3000);
    
    // Find all expandable items (typically buttons or elements with a toggling class)
    const expandableItems = await page.$$("nav.rm-Sidebar li[aria-expanded='false'], nav.rm-Sidebar li.expandable");
    console.log(`Found ${expandableItems.length} expandable items`);
    
    // Click each expandable item to reveal its content
    for (const item of expandableItems) {
      try {
        await item.click();
        await page.waitForTimeout(1000); // Wait for expansion animation
      } catch (err) {
        console.log("Error expanding an item:", err.message);
      }
    }
    
    // Now scrape the fully expanded navigation
    return await scrapeNavLinks(url);
    
  } catch (error) {
    console.error(`Error expanding items on ${url}:`, error);
    await browser.close();
    return {};
  }
}

(async () => {
  let allStructure = {};
  
  for (const url of BASE_URLS) {
    // Try both regular scraping and the expand-then-scrape approach
    let structure = await scrapeNavLinks(url);
    
    // If few links were found, try the expansion method
    const totalLinks = Object.values(structure).reduce((sum, links) => sum + links.length, 0);
    if (totalLinks < 10) {
      console.log(`Few links found (${totalLinks}). Trying expansion method...`);
      structure = await expandAndScrapeNavItems(url);
    }
    
    // Merge structures
    for (const [section, links] of Object.entries(structure)) {
      if (!allStructure[section]) {
        allStructure[section] = [];
      }
      
      // Add unique links
      for (const link of links) {
        if (!allStructure[section].some(existing => existing.url === link.url)) {
          allStructure[section].push(link);
        }
      }
    }
  }
  
  // Check if we found any links
  const totalLinks = Object.values(allStructure).reduce((sum, links) => sum + links.length, 0);
  
  if (totalLinks === 0) {
    console.log("No links were found. There might be issues with the selectors or page structure.");
  } else {
    console.log(`\nTotal sections: ${Object.keys(allStructure).length}`);
    console.log(`Total links: ${totalLinks}`);
    
    // Save to JSON
    fs.writeFileSync(
      "capillary_doc_links.json", 
      JSON.stringify(allStructure, null, 2), 
      "utf-8"
    );
    
    // Also save as text
    let textOutput = "# Capillary Tech Documentation Links\n\n";
    
    for (const [section, links] of Object.entries(allStructure)) {
      textOutput += `\n## ${section} (${links.length} links):\n`;
      links.forEach(link => textOutput += `- ${link.title}: ${link.url}\n`);
    }
    
    fs.writeFileSync("capillary_doc_links.txt", textOutput, "utf-8");
    
    console.log("\n✅ Links saved to capillary_doc_links.json and capillary_doc_links.txt");
  }
})();