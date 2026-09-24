import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/svelte';
import GroupTab from './GroupTab.svelte';

const defaultProps = {
  filters: ['All', 'Owned', 'Shared'],
  selected: 'Owned',
  label: 'show_albums',
  onSelect: () => {},
};

describe('GroupTab component', () => {
  it('muestra un badge con el contador junto a cada pestaña cuando se proporcionan', () => {
    render(GroupTab, {
      props: { ...defaultProps, badges: [8, 6, 2] },
    });

    expect(screen.getByTestId('group-tab-badge-0')).toHaveTextContent('8');
    expect(screen.getByTestId('group-tab-badge-1')).toHaveTextContent('6');
    expect(screen.getByTestId('group-tab-badge-2')).toHaveTextContent('2');
  });

  it('no renderiza badges cuando no se proporcionan (compatibilidad hacia atrás)', () => {
    render(GroupTab, { props: defaultProps });

    expect(screen.queryByTestId('group-tab-badge-0')).not.toBeInTheDocument();
  });

  it('muestra un spinner en la pestaña activa mientras loading es true', () => {
    render(GroupTab, {
      props: { ...defaultProps, loading: true },
    });

    expect(screen.getByTestId('group-tab-spinner-1')).toBeInTheDocument();
    expect(screen.queryByTestId('group-tab-spinner-0')).not.toBeInTheDocument();
    expect(screen.queryByTestId('group-tab-spinner-2')).not.toBeInTheDocument();
  });
});