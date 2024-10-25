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

async function getYesterdayPage() {
  const yesterday = new Date(new Date().setDate(new Date().getDate() - 1)).toISOString().split('T')[0];
  const response = await notion.blocks.children.list({ block_id: PARENT_PAGE_ID });
  const yesterdayPage = response.results.find(
    (page) => page.type === 'child_page' && page.child_page.title.includes(`${yesterday}`),
  );

  return yesterdayPage;
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
    (page) => page.type === 'child_page' && page.child_page.title.includes(`${today}`),
  )?.id;
  return todayPageId || undefined;
}

async function moveIncompleteTasks() {
  const yesterdayPage = await getYesterdayPage();

  if (!yesterdayPage) {
    console.log('Yesterday page not found, skipping task migration');
    return;
  }

  const todayPageContent = await getTodayPageContent();
  const blocks = await notion.blocks.children.list({ block_id: yesterdayPage.id });
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
