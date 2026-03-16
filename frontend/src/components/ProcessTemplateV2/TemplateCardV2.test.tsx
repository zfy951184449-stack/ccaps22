import React from 'react';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import TemplateCardV2 from './TemplateCardV2';

const template = {
  id: 101,
  template_code: 'PT-90001',
  template_name: '测试模板',
  team_id: 2,
  team_code: 'USP',
  team_name: 'USP',
  description: 'desc',
  total_days: 3,
  stage_count: 2,
  created_at: '2026-03-15T00:00:00.000Z',
  updated_at: '2026-03-15T00:00:00.000Z',
};

describe('TemplateCardV2', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
    jest.clearAllMocks();
  });

  it('selects template without opening editor when clicking radio', async () => {
    const onSelect = jest.fn();
    const onContinue = jest.fn();

    await act(async () => {
      root.render(
        <TemplateCardV2
          template={template}
          density="card"
          selected={false}
          onSelect={onSelect}
          onContinue={onContinue}
          onCopy={jest.fn()}
          onFocus={jest.fn()}
        />,
      );
    });

    const radioInput = document.querySelector('input[type="radio"]') as HTMLInputElement | null;
    expect(radioInput).toBeTruthy();

    await act(async () => {
      radioInput?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      radioInput?.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(onSelect).toHaveBeenCalledWith(template);
    expect(onContinue).not.toHaveBeenCalled();
  });

  it('opens editor when clicking the card body', async () => {
    const onContinue = jest.fn();

    await act(async () => {
      root.render(
        <TemplateCardV2
          template={template}
          density="card"
          selected={false}
          onSelect={jest.fn()}
          onContinue={onContinue}
          onCopy={jest.fn()}
          onFocus={jest.fn()}
        />,
      );
    });

    const article = document.querySelector('article');
    expect(article).toBeTruthy();

    await act(async () => {
      article?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onContinue).toHaveBeenCalledWith(template);
  });
});
