import type { Config } from '@docusaurus/types';

const config: Config = {
  title: 'OMG Library',
  url: 'https://stevenbuglione.github.io',
  baseUrl: '/omg-site/',
  organizationName: 'StevenBuglione',
  projectName: 'omg-site',
  trailingSlash: true,
  favicon: 'img/favicon.svg',
  presets: [['classic', { docs: false, blog: false, theme: { customCss: './src/css/custom.css' } }]],
  themeConfig: {
    navbar: {
      title: 'OMG Library',
      items: [
        { to: '/wiki/', label: 'Wiki', position: 'left' },
        { to: '/graph/', label: 'Graph', position: 'left' },
        { to: '/search', label: 'Search', position: 'left' },
        { to: '/agents', label: 'Agents', position: 'left' },
        { href: 'https://github.com/StevenBuglione/omg-data-registry', label: 'Registry', position: 'right' },
      ],
    },
  },
};

export default config;
