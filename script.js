/* ==========
 *  Vanilla Kanban
 *  - Columns + Tasks
 *  - Drag & drop tasks & columns
 *  - LocalStorage persistence
 *  - Progress bars
 *  - Light/Dark theme toggle
 * ========== */

const boardEl = document.getElementById('board');
const addColumnBtn = document.getElementById('addColumnBtn');
const resetBtn = document.getElementById('resetBtn');
const overallProgressBar = document.getElementById('overallProgressBar');
const overallProgressText = document.getElementById('overallProgressText');
const themeToggle = document.getElementById('themeToggle');

const taskModal = document.getElementById('taskModal');
const taskForm = document.getElementById('taskForm');
const modalTitleEl = document.getElementById('modalTitle');
const taskTitleEl = document.getElementById('taskTitle');
const taskDescEl = document.getElementById('taskDesc');
const taskDueEl = document.getElementById('taskDue');
const taskTagsEl = document.getElementById('taskTags');
const cancelModalBtn = document.getElementById('cancelModal');

const columnTemplate = document.getElementById('columnTemplate');
const taskTemplate = document.getElementById('taskTemplate');

let state = loadState() || getInitialState();

// modal context
let editingTaskId = null;
let editingColumnId = null;

// ---------- GLOBAL FIX: allow dropping ----------
document.addEventListener('dragover', (e) => e.preventDefault());
// Prevent default drop behavior if it's our custom drag types
document.addEventListener('drop', (e) => {
  const types = e.dataTransfer?.types || [];
  if (types.includes('text/task') || types.includes('text/column')) {
    e.preventDefault();
  }
});

// ========= INIT =========
render();
attachGlobalEvents();

// ========= STATE =========
function getInitialState() {
  return {
    theme: 'dark',
    columns: [
      { id: uid(), title: 'Backlog', taskIds: [] },
      { id: uid(), title: 'In Progress', taskIds: [] },
      { id: uid(), title: 'Done', taskIds: [] }
    ],
    tasks: {}
  };
}

function saveState() {
  localStorage.setItem('vanilla-kanban', JSON.stringify(state));
}

function loadState() {
  try {
    const raw = localStorage.getItem('vanilla-kanban');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// ========= RENDER =========
function render() {
  // theme
  document.documentElement.classList.toggle('light', state.theme === 'light');
  themeToggle.textContent = state.theme === 'light' ? '🌞' : '🌙';

  // board
  boardEl.innerHTML = '';

  state.columns.forEach((col) => {
    const colNode = buildColumn(col);
    boardEl.appendChild(colNode);
  });

  computeProgress();
}

function buildColumn(column) {
  const clone = columnTemplate.content.firstElementChild.cloneNode(true);
  const colEl = clone;
  colEl.dataset.columnId = column.id;

  const titleEl = colEl.querySelector('.column-title');
  titleEl.textContent = column.title;
  titleEl.addEventListener('blur', () => {
    state.columns = state.columns.map(c =>
      c.id === column.id ? { ...c, title: titleEl.textContent.trim() || 'Untitled' } : c
    );
    saveState();
    render();
  });

  const addTaskBtn = colEl.querySelector('.add-task');
  addTaskBtn.addEventListener('click', () => {
    editingTaskId = null;
    editingColumnId = column.id;
    openTaskModal('New Task');
  });

  const deleteColumnBtn = colEl.querySelector('.delete-column');
  deleteColumnBtn.addEventListener('click', () => {
    if (confirm('Delete this column and all its tasks?')) {
      column.taskIds.forEach(id => delete state.tasks[id]);
      state.columns = state.columns.filter(c => c.id !== column.id);
      saveState();
      render();
    }
  });

  // Progress setup
  const colProgressText = colEl.querySelector('.column-progress-text');
  const colProgressFill = colEl.querySelector('.progress-fill');
  colEl._progressRefs = { colProgressText, colProgressFill };

  // Tasks container
  const tasksEl = colEl.querySelector('.tasks');

  // DND events (tasks dropzone)
  tasksEl.addEventListener('dragover', handleTaskDragOver);
  tasksEl.addEventListener('drop', (e) => handleTaskDrop(e, column.id));
  tasksEl.addEventListener('dragleave', () => {
    const ph = tasksEl.querySelector('.placeholder');
    if (ph) ph.remove();
  });

  // Render tasks
  column.taskIds.forEach(taskId => {
    const taskData = state.tasks[taskId];
    if (!taskData) return;
    const taskEl = buildTask(taskData, column.id);
    tasksEl.appendChild(taskEl);
  });

  // Column drag & drop handlers
  colEl.addEventListener('dragstart', (e) => {
    if (e.target.closest('.task')) return; // ignore when dragging a task
    colEl.classList.add('dragging');
    if (e.dataTransfer) {
      e.dataTransfer.setData('text/column', column.id);
      e.dataTransfer.effectAllowed = 'move';
    }
  });

  colEl.addEventListener('dragend', () => {
    colEl.classList.remove('dragging');
    const ph = document.querySelector('.column-placeholder');
    if (ph) ph.remove();
  });

  colEl.addEventListener('dragover', (e) => {
    const draggingColumnId = e.dataTransfer?.getData('text/column');
    if (!draggingColumnId) return;
    e.preventDefault();

    const afterElement = getColumnAfterElement(boardEl, e.clientX);
    const currentPh = document.querySelector('.column-placeholder') || createColumnPlaceholder();

    if (!afterElement) {
      boardEl.appendChild(currentPh);
    } else {
      boardEl.insertBefore(currentPh, afterElement);
    }
  });

  colEl.addEventListener('drop', (e) => {
    const draggingColumnId = e.dataTransfer?.getData('text/column');
    if (!draggingColumnId) return;

    const ph = document.querySelector('.column-placeholder');
    let newIndex;
    if (ph) {
      const siblings = [...boardEl.children];
      newIndex = siblings.indexOf(ph);
      ph.remove();
    } else {
      newIndex = state.columns.length - 1;
    }

    const oldIndex = state.columns.findIndex(c => c.id === draggingColumnId);
    const [moved] = state.columns.splice(oldIndex, 1);
    state.columns.splice(newIndex, 0, moved);

    saveState();
    render();
  });

  colEl.setAttribute('draggable', 'true');

  return colEl;
}

function buildTask(task, columnId) {
  const clone = taskTemplate.content.firstElementChild.cloneNode(true);
  const taskEl = clone;
  taskEl.dataset.taskId = task.id;
  taskEl.dataset.columnId = columnId;

  const titleEl = taskEl.querySelector('.task-title');
  const descEl = taskEl.querySelector('.task-desc');
  const dueEl = taskEl.querySelector('.badge.due');
  const tagsEl = taskEl.querySelector('.tags');

  titleEl.textContent = task.title;
  descEl.textContent = task.description || '';

  if (task.dueDate) {
    dueEl.textContent = task.dueDate;
    dueEl.style.display = 'inline-block';
  } else {
    dueEl.style.display = 'none';
  }

  tagsEl.innerHTML = '';
  (task.tags || []).forEach(tag => {
    const span = document.createElement('span');
    span.className = 'tag';
    span.textContent = tag.trim();
    tagsEl.appendChild(span);
  });

  // Actions
  taskEl.querySelector('.edit-task').addEventListener('click', () => {
    editingTaskId = task.id;
    editingColumnId = columnId;
    openTaskModal('Edit Task', task);
  });

  taskEl.querySelector('.delete-task').addEventListener('click', () => {
    if (confirm('Delete this task?')) {
      const col = state.columns.find(c => c.id === columnId);
      col.taskIds = col.taskIds.filter(id => id !== task.id);
      delete state.tasks[task.id];

      saveState();
      render();
    }
  });

  // Dragging
  taskEl.addEventListener('dragstart', (e) => {
    taskEl.classList.add('dragging');
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/task', task.id);
      e.dataTransfer.setData('text/fromColumn', columnId);
    }
  });

  taskEl.addEventListener('dragend', () => {
    taskEl.classList.remove('dragging');
    document.querySelectorAll('.placeholder').forEach(p => p.remove());
  });

  return taskEl;
}

// ========= DRAG HELPERS =========
function handleTaskDragOver(e) {
  const draggingTaskId = e.dataTransfer?.getData('text/task');
  if (!draggingTaskId) return;

  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';

  const container = e.currentTarget; // .tasks
  const afterElement = getTaskAfterElement(container, e.clientY);

  let ph = container.querySelector('.placeholder');
  if (!ph) {
    ph = document.createElement('div');
    ph.className = 'placeholder';
  }

  if (!afterElement) {
    container.appendChild(ph);
  } else {
    container.insertBefore(ph, afterElement);
  }
}

function handleTaskDrop(e, toColumnId) {
  const taskId = e.dataTransfer?.getData('text/task');
  const fromColumnId = e.dataTransfer?.getData('text/fromColumn');
  if (!taskId) return;

  const fromCol = state.columns.find(c => c.id === fromColumnId);
  const toCol = state.columns.find(c => c.id === toColumnId);

  const fromIndex = fromCol.taskIds.indexOf(taskId);
  if (fromIndex !== -1) fromCol.taskIds.splice(fromIndex, 1);

  const container = e.currentTarget;
  const ph = container.querySelector('.placeholder');
  let newIndex = toCol.taskIds.length;
  if (ph) {
    const siblings = [...container.children];
    newIndex = siblings.indexOf(ph);
  }

  toCol.taskIds.splice(newIndex, 0, taskId);

  const toColTitle = toCol.title.toLowerCase();
  if (toColTitle.includes('done') || toColTitle.includes('complete')) {
    state.tasks[taskId].completed = true;
  } else {
    state.tasks[taskId].completed = false;
  }

  saveState();
  render();
}

function getTaskAfterElement(container, y) {
  const draggableElements = [...container.querySelectorAll('.task:not(.dragging)')];

  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) {
      return { offset, element: child };
    }
    return closest;
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function getColumnAfterElement(container, x) {
  const columns = [...container.querySelectorAll('.column:not(.dragging)')];
  return columns.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = x - box.left - box.width / 2;
    if (offset < 0 && offset > closest.offset) {
      return { offset, element: child };
    }
    return closest;
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function createColumnPlaceholder() {
  const ph = document.createElement('div');
  ph.className = 'column-placeholder';
  return ph;
}

// ========= PROGRESS =========
function computeProgress() {
  let total = 0;
  let done = 0;

  state.columns.forEach((col) => {
    const tasks = col.taskIds.map(id => state.tasks[id]).filter(Boolean);
    const colTotal = tasks.length;
    const colDone = tasks.filter(t => t.completed).length;

    total += colTotal;
    done += colDone;

    const colEl = boardEl.querySelector(`[data-column-id="${col.id}"]`);
    if (colEl && colEl._progressRefs) {
      const pct = colTotal === 0 ? 0 : Math.round((colDone / colTotal) * 100);
      colEl._progressRefs.colProgressText.textContent = `${pct}%`;
      colEl._progressRefs.colProgressFill.style.width = `${pct}%`;
    }
  });

  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  overallProgressText.textContent = `${pct}%`;
  overallProgressBar.style.width = `${pct}%`;
}

// ========= MODAL =========
function openTaskModal(title, data = null) {
  modalTitleEl.textContent = title;

  taskTitleEl.value = data?.title ?? '';
  taskDescEl.value = data?.description ?? '';
  taskDueEl.value = data?.dueDate ?? '';
  taskTagsEl.value = data?.tags?.join(', ') ?? '';

  taskModal.showModal();
  taskTitleEl.focus();
}

function closeTaskModal() {
  taskModal.close();
  taskForm.reset();
  editingTaskId = null;
  editingColumnId = null;
}

// ========= EVENTS =========
function attachGlobalEvents() {
  addColumnBtn.addEventListener('click', () => {
    const id = uid();
    state.columns.push({ id, title: `Column ${state.columns.length + 1}`, taskIds: [] });
    saveState();
    render();
  });

  resetBtn.addEventListener('click', () => {
    if (confirm('Reset the board to a clean state?')) {
      state = getInitialState();
      saveState();
      render();
    }
  });

  themeToggle.addEventListener('click', () => {
    state.theme = state.theme === 'light' ? 'dark' : 'light';
    saveState();
    render();
  });

  taskForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const payload = {
      title: taskTitleEl.value.trim(),
      description: taskDescEl.value.trim(),
      dueDate: taskDueEl.value || null,
      tags: taskTagsEl.value ? taskTagsEl.value.split(',').map(t => t.trim()).filter(Boolean) : [],
      completed: false
    };

    if (!payload.title) {
      alert('Title is required');
      return;
    }

    if (editingTaskId) {
      state.tasks[editingTaskId] = { ...state.tasks[editingTaskId], ...payload };
    } else {
      const id = uid();
      state.tasks[id] = { id, ...payload };
      const column = state.columns.find(c => c.id === editingColumnId);
      column.taskIds.push(id);
    }

    saveState();
    render();
    closeTaskModal();
  });

  cancelModalBtn.addEventListener('click', (e) => {
    e.preventDefault();
    closeTaskModal();
  });

  taskModal.addEventListener('click', (e) => {
    const rect = taskModal.getBoundingClientRect();
    const inside = (
      e.clientX >= rect.left &&
      e.clientX <= rect.right &&
      e.clientY >= rect.top &&
      e.clientY <= rect.bottom
    );
    if (!inside) closeTaskModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && taskModal.open) {
      closeTaskModal();
    }
  });
}
