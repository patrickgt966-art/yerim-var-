import '@/i18n';

import { render, screen } from '@testing-library/react-native';

import { BrandWordmark } from '../BrandWordmark';

describe('BrandWordmark', () => {
  it('is one accessible "Yerim Var", a header when asked', async () => {
    await render(<BrandWordmark layout="inline" tone="onDark" size={18} header />);
    expect(screen.getByRole('header', { name: 'Yerim Var' })).toBeTruthy();
  });

  it('is not a header by default', async () => {
    await render(<BrandWordmark layout="stacked" tone="onLight" size={56} />);
    expect(screen.getByLabelText('Yerim Var')).toBeTruthy();
    expect(screen.queryByRole('header')).toBeNull();
  });

  it('uses a dotless ı and colours: white on dark, navy on light, "Var" orange', async () => {
    const { unmount } = await render(<BrandWordmark layout="inline" tone="onDark" size={20} />);
    expect(screen.getByText('ı')).toBeTruthy();
    expect(screen.getByText('Yer')).toHaveStyle({ color: '#FFFFFF' });
    expect(screen.getByText('Var')).toHaveStyle({ color: '#FF8A1F' });
    await unmount();
    await render(<BrandWordmark layout="inline" tone="onLight" size={20} />);
    expect(screen.getByText('Yer')).toHaveStyle({ color: '#0B3C49' });
  });
});
