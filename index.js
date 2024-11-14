require('dotenv').config();
const { Client } = require('@notionhq/client');

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const PARENT_PAGE_ID = process.env.PARENT_PAGE_ID;

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

  // Recursively fetch children blocks
  for (const block of blocks) {
    if (block.has_children) {
      block.children = await fetchPageContent(block.id);
    }
  }

  return blocks;
};

const removeCheckedItems = async () => {
  const deleteDoneItems = async (blocks) => {
    for (const block of blocks) {
      if (block.type === 'to_do' && block.to_do.checked) {
        await notion.blocks.delete({ block_id: block.id });
      } else if (block.children) {
        await deleteDoneItems(block.children);
      }
    }
  };

  const updateLastUpdated = async (blockId) => {
    const today = new Date();
    const formattedDate = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Vancouver',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    }).format(today);

    const blocks = await fetchPageContent(blockId);

    const lastUpdatedBlock = blocks.find(
      (block) => block.type === 'paragraph' && block.paragraph.rich_text[0]?.plain_text?.startsWith('Last Updated:'),
    );

    if (lastUpdatedBlock) {
      await notion.blocks.update({
        block_id: lastUpdatedBlock.id,
        paragraph: {
          rich_text: [
            {
              type: 'text',
              text: {
                content: `Last Updated: ${formattedDate}`,
              },
              annotations: {
                color: 'gray',
                italic: true,
              },
            },
          ],
        },
      });
    }
  };

  const blocks = await fetchPageContent(PARENT_PAGE_ID);
  await deleteDoneItems(blocks);
  await updateLastUpdated(PARENT_PAGE_ID);
};

removeCheckedItems().catch(console.error);
