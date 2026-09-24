import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/svelte';
import { albumFactory } from '@test-data/factories/album-factory';
import { sdkMock } from '$lib/__mocks__/sdk.mock';
import { eventManager } from '$lib/managers/event-manager.svelte';
import { invalidateAlbumStatistics } from '$lib/services/album-statistics.service';
import { beforeEach, vi } from 'vitest';
import AlbumFilterTabs from './AlbumFilterTabs.svelte';

const defaultProps = {
  filters: ['All', 'Owned', 'Shared'],
  selected: 'Owned',
  label: 'show_albums',
  onSelect: () => {},
};

describe('AlbumFilterTabs component', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    invalidateAlbumStatistics();
    sdkMock.getAlbumStatistics.mockResolvedValue({ notShared: 4, owned: 6, shared: 2 });
  });

  it('carga las estadísticas de álbumes al montarse', async () => {
    render(AlbumFilterTabs, { props: defaultProps });

    await waitFor(() => {
      expect(sdkMock.getAlbumStatistics).toHaveBeenCalledTimes(1);
    });
  });

  it('muestra los contadores una vez que las estadísticas se resuelven', async () => {
    sdkMock.getAlbumStatistics.mockResolvedValue({ notShared: 4, owned: 6, shared: 2 });

    render(AlbumFilterTabs, { props: defaultProps });

    expect(await screen.findByTestId('group-tab-badge-0')).toHaveTextContent('6');
    expect(screen.getByTestId('group-tab-badge-1')).toHaveTextContent('6');
    expect(screen.getByTestId('group-tab-badge-2')).toHaveTextContent('2');
  });

  it('muestra un spinner en la pestaña activa mientras carga', async () => {
    let resolveStats!: (value: { notShared: number; owned: number; shared: number }) => void;
    sdkMock.getAlbumStatistics.mockReturnValue(
      new Promise((resolve) => {
        resolveStats = resolve;
      }),
    );

    render(AlbumFilterTabs, { props: defaultProps });

    expect(screen.getByTestId('group-tab-spinner-1')).toBeInTheDocument();

    resolveStats({ notShared: 4, owned: 6, shared: 2 });

    await waitFor(() => {
      expect(screen.queryByTestId('group-tab-spinner-1')).not.toBeInTheDocument();
    });
  });

  it('invalida la caché y recarga al crearse un álbum', async () => {
    render(AlbumFilterTabs, { props: defaultProps });

    await screen.findByTestId('group-tab-badge-1');

    sdkMock.getAlbumStatistics.mockResolvedValue({ notShared: 5, owned: 7, shared: 3 });
    eventManager.emit('AlbumCreate', albumFactory.build());

    await waitFor(() => {
      expect(sdkMock.getAlbumStatistics).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByTestId('group-tab-badge-0')).toHaveTextContent('8');
  });

  it('invalida la caché y recarga al eliminarse un álbum', async () => {
    render(AlbumFilterTabs, { props: defaultProps });

    await screen.findByTestId('group-tab-badge-1');

    sdkMock.getAlbumStatistics.mockResolvedValue({ notShared: 2, owned: 3, shared: 1 });
    eventManager.emit('AlbumDelete', albumFactory.build());

    await waitFor(() => {
      expect(sdkMock.getAlbumStatistics).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByTestId('group-tab-badge-0')).toHaveTextContent('3');
  });
});