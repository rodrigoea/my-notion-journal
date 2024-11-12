require('dotenv').config();
const { Client } = require('@notionhq/client');

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const PARENT_PAGE_ID = process.env.PARENT_PAGE_ID;

const removeCheckedItems = async () => {
  const fetchPageContent = async (blockId) => {
    const blocks = [];
    let cursor;
    do {
      const { results, next_cursor } = await notion.blocks.children.list({
        block_id: blockId,
        start_cursor: cursor,
      });
      blocks.push(...results);
      cursor = next_cursor;
    } while (cursor);
    return blocks;
  };

  const deleteDoneItems = async (blocks) => {
    for (const block of blocks) {
      if (block.type === 'to_do' && block.to_do.checked) {
        // Delete the checked item
        await notion.blocks.delete({ block_id: block.id });
      } else if (block.has_children) {
        // recursively process nested items
        const childBlocks = await fetchPageContent(block.id);
        await deleteDoneItems(childBlocks);
      }
    }
  };

  // Fetch the main page content
  const mainContent = await fetchPageContent(PARENT_PAGE_ID);
  await deleteDoneItems(mainContent);
};

async function runDailyAutomation() {
  await removeCheckedItems();
  console.log("Checked 'Done' items removed.");
}

runDailyAutomation().catch(console.error);
