import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/svelte';
import { init, register, waitLocale } from 'svelte-i18n';
import { AssetTypeEnum, AssetVisibility } from '@immich/sdk';
  import { sdkMock } from '$lib/__mocks__/sdk.mock';
  import QuickFilterBar from './QuickFilterBar.svelte';

describe('QuickFilterBar component', () => {
  beforeAll(async () => {
    await init({ fallbackLocale: 'en-US' });
    register('en-US', () => import('$i18n/en.json'));
    await waitLocale('en-US');
  });

  beforeEach(() => {
    vi.resetAllMocks();
    sdkMock.getAssetStatistics.mockResolvedValue({ images: 0, videos: 0, total: 0 });
  });

  it('loads timeline statistics on mount', async () => {
    render(QuickFilterBar);

    await waitFor(() => {
      expect(sdkMock.getAssetStatistics).toHaveBeenCalledWith({
        visibility: AssetVisibility.Timeline,
      });
    });
  });

  it('shows asset counters once statistics resolve', async () => {
    sdkMock.getAssetStatistics.mockResolvedValue({
      images: 120,
      videos: 30,
      total: 150,
    });

    render(QuickFilterBar);

    expect(await screen.findByTestId('filter-count-all')).toHaveTextContent('150');
    expect(screen.getByTestId('filter-count-photos')).toHaveTextContent('120');
    expect(screen.getByTestId('filter-count-videos')).toHaveTextContent('30');
  });

  it('shows a spinner on the active pill and marks the bar busy while loading', () => {
    render(QuickFilterBar, { props: { value: AssetTypeEnum.Image, loading: true } });

    const bar = screen.getByTestId('quick-filter-bar');
    expect(bar).toHaveAttribute('aria-busy', 'true');

    const activePill = screen.getByRole('button', { name: 'Photos' });
    expect(activePill.querySelector('[data-testid="filter-spinner"]')).not.toBeNull();

    const inactivePill = screen.getByRole('button', { name: 'Videos' });
    expect(inactivePill.querySelector('[data-testid="filter-spinner"]')).toBeNull();
  });
});