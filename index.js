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

async function getTodayPageId() {
  const today = new Date().toISOString().split('T')[0];
  const response = await notion.blocks.children.list({ block_id: PARENT_PAGE_ID });
  const todayPageId = response.results.find(
    (page) => page.type === 'child_page' && page.child_page.title.includes(`Daily Journal - ${today}`),
  )?.id;
  return todayPageId || undefined;
}

// Helper function to move nested tasks
async function moveNestedTasks(tasks, todayPageId) {
  for (const task of tasks) {
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

    // Check if the task has nested children and move them as well
    if (task.has_children) {
      const nestedTasks = await notion.blocks.children.list({ block_id: task.id });
      await moveNestedTasks(nestedTasks.results, todayPageId);
    }
  }
}

async function moveIncompleteTasks() {
  const mostRecentPage = await getMostRecentPage();
  if (!mostRecentPage) {
    console.log('No recent page found, skipping task migration');
    return;
  }

  const todayPageId = await getTodayPageId();
  if (!todayPageId) return;

  const blocks = await notion.blocks.children.list({ block_id: mostRecentPage.id });
  const incompleteTasks = blocks.results.filter((block) => block.type === 'to_do' && !block.to_do.checked);

  // Move all tasks, including nested ones
  await moveNestedTasks(incompleteTasks, todayPageId);
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
