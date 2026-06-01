import React from 'react';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import ProcessTemplateV3List from './ProcessTemplateV3List';

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('axios', () => ({
  get: jest.fn(),
}));

jest.mock('../../services', () => ({
  processTemplateV2Api: {
    listTemplates: jest.fn(),
    copyTemplate: jest.fn(),
    createTemplate: jest.fn(),
  },
}));

jest.mock('../../services/templateWorkbookApi', () => ({
  exportTemplateWorkbook: jest.fn(),
}));

jest.mock('../../utils/exportTemplateExcel', () => ({
  exportTemplateToExcel: jest.fn(),
}));

jest.mock('../MfgTemplatePackagePanel', () => function MockMfgTemplatePackagePanel() {
  return null;
});

jest.mock('../TemplateWorkbookImportModal', () => function MockTemplateWorkbookImportModal() {
  return null;
});

const axiosMock = jest.requireMock('axios');
const { processTemplateV2Api: mockProcessTemplateV2Api } = jest.requireMock('../../services');

const templates = [
  {
    id: 2,
    template_code: 'PT-00002',
    template_name: 'WBP2486/B',
    team_id: 1,
    team_code: 'USP',
    team_name: 'USP',
    description: '',
    total_days: 41,
    stage_count: 1,
    created_at: '2026-03-15T00:00:00.000Z',
    updated_at: '2026-03-15T00:00:00.000Z',
  },
];

const waitForCondition = async (condition: () => boolean, timeoutMs = 3500) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (condition()) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
  }
  throw new Error('waitForCondition timeout');
};

describe('ProcessTemplateV3List', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    jest.clearAllMocks();
    axiosMock.get.mockResolvedValue({ data: [{ id: 1, unit_name: 'USP' }] });
    mockProcessTemplateV2Api.listTemplates.mockResolvedValue(templates);

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  const renderList = async () => {
    await act(async () => {
      root.render(<ProcessTemplateV3List />);
    });
    await waitForCondition(() => Boolean(document.body.textContent?.includes('PT-00002')));
  };

  it('selects a template from the checkbox without opening the editor', async () => {
    await renderList();

    const checkboxLabel = document.querySelector('.v3-template-row label.wxb-checkbox') as HTMLLabelElement | null;
    const checkbox = document.querySelector('.v3-template-row input[type="checkbox"]') as HTMLInputElement | null;
    expect(checkboxLabel).toBeTruthy();
    expect(checkbox).toBeTruthy();

    await act(async () => {
      checkboxLabel?.click();
      await Promise.resolve();
    });

    expect(checkbox?.checked).toBe(true);
    expect(document.querySelector('.v3-template-row.is-selected')).toBeTruthy();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('opens the editor when clicking the row body', async () => {
    await renderList();

    const rowTitle = document.querySelector('.v3-template-row-title') as HTMLElement | null;
    expect(rowTitle).toBeTruthy();

    await act(async () => {
      rowTitle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(mockNavigate).toHaveBeenCalledWith('/process-templates/2');
  });
});
