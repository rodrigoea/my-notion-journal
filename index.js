require('dotenv').config();
const { Client } = require('@notionhq/client');

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const PARENT_PAGE_ID = process.env.PARENT_PAGE_ID;

async function createDailyPage() {
  const today = new Date().toISOString().split('T')[0];
  const response = await notion.pages.create({
    parent: { page_id: PARENT_PAGE_ID },
    properties: {
      title: [{ text: { content: `Daily Journal - ${today}` } }],
    },
  });

  return response;
}

async function getMostRecentPage() {
  const response = await notion.blocks.children.list({ block_id: PARENT_PAGE_ID });
  const today = new Date();

  for (let i = 1; i <= 7; i++) {
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() - i);
    const formattedDate = targetDate.toISOString().split('T')[0];
    const page = response.results.find(
      (page) => page.type === 'child_page' && page.child_page.title.includes(`Daily Journal - ${formattedDate}`),
    );
    if (page) return page;
  }

  console.log('No previous page found within the last 7 days');
  return null;
}

async function getTodayPageContent() {
  const todayPageId = await getTodayPageId();

  if (!todayPageId) {
    console.log('Today page not found');
    return;
  }

  const todayPageContent = await notion.blocks.children.list({ block_id: todayPageId });
  return todayPageContent;
}

async function getTodayPageId() {
  const today = new Date().toISOString().split('T')[0];
  const response = await notion.blocks.children.list({ block_id: PARENT_PAGE_ID });
  const todayPageId = response.results.find(
    (page) => page.type === 'child_page' && page.child_page.title.includes(`Daily Journal - ${today}`),
  )?.id;
  return todayPageId || undefined;
}

async function moveIncompleteTasks() {
  const mostRecentPage = await getMostRecentPage();

  if (!mostRecentPage) {
    console.log('No recent page found, skipping task migration');
    return;
  }

  const todayPageContent = await getTodayPageContent();
  const blocks = await notion.blocks.children.list({ block_id: mostRecentPage.id });
  const todayPageId = await getTodayPageId();

  const incompleteTasks = blocks.results.filter((block) => block.type === 'to_do' && !block.to_do.checked);

  for (const task of incompleteTasks) {
    const taskAlreadyExists = todayPageContent.results.some(
      (block) =>
        block.type === 'to_do' && block.to_do.rich_text[0].text.content === task.to_do.rich_text[0].text.content,
    );

    if (taskAlreadyExists) {
      console.log(`Task "${task.to_do.rich_text[0].text.content}" already exists in today's page`);
      continue;
    }

    await notion.blocks.children.append({
      block_id: todayPageId,
      children: [
        {
          object: 'block',
          type: 'to_do',
          to_do: {
            rich_text: task.to_do.rich_text,
            checked: false,
          },
        },
      ],
    });
  }
}

async function runDailyAutomation() {
  const hasTodayPage = !!(await getTodayPageId());

  if (hasTodayPage) {
    console.log('Daily page already exists');
  } else {
    try {
      await createDailyPage();
      console.log('Daily page created');
    } catch (error) {
      throw new Error(`Error creating daily page ${error}`);
    }
  }

  await moveIncompleteTasks();
}

runDailyAutomation().catch(console.error);
