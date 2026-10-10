import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const config: Config = {
  title: '山商方块嘉年华',
  tagline: '七个社团，一张方块校园',
  favicon: 'img/favicon.ico',

  // Future flags, see https://docusaurus.io/docs/api/docusaurus-config#future
  future: {
    v4: true, // Improve compatibility with the upcoming Docusaurus v4
  },

  // 页脚用到的两个常量（src/theme/Footer 读取）
  customFields: {
    // 页脚「Source Codes」按钮的目标仓库
    sourceCodeUrl: 'https://github.com/MyGOClubParty/club-party-website',
    // 跟在版权行末尾的一句话
    builtWith: 'Built with Docusaurus.',
  },

  // Set the production url of your site here
  url: 'https://club-party.iicemeta.com',
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: '/',

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: 'MyGOClubParty', // Usually your GitHub org/user name.
  projectName: 'club-party-website', // Usually your repo name.

  onBrokenLinks: 'throw',

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'zh-Hans',
    locales: ['zh-Hans'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          // Please change this to your repo.
          // Remove this to remove the "edit this page" links.
          editUrl:
            'https://github.com/MyGOClubParty/club-party-website/tree/main/',
        },
        blog: {
          showReadingTime: true,
          feedOptions: {
            type: ['rss', 'atom'],
            xslt: true,
          },
          // Please change this to your repo.
          // Remove this to remove the "edit this page" links.
          editUrl:
            'https://github.com/MyGOClubParty/club-party-website/tree/main/',
          // Useful options to enforce blogging best practices
          onInlineTags: 'warn',
          onInlineAuthors: 'warn',
          onUntruncatedBlogPosts: 'warn',
        },
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    // Replace with your project's social card
    image: 'img/docusaurus-social-card.jpg',
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: '山商方块嘉年华',
      logo: {
        alt: '山商方块嘉年华 Logo',
        src: 'img/logo.png',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'mainSidebar',
          position: 'left',
          label: '活动说明',
        },
        {to: '/docs/clubs', label: '社团风采', position: 'left'},
        {to: '/blog', label: '活动日志', position: 'left'},
        {
          href: 'https://github.com/MyGOClubParty/',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: '活动',
          items: [
            {
              label: '活动总览',
              to: '/docs/intro',
            },
            {
              label: '活动流程',
              to: '/docs/activity/process',
            },
            {
              label: '奖项设置',
              to: '/docs/activity/awards',
            },
          ],
        },
        {
          title: '社团',
          items: [
            {
              label: '社团一览',
              to: '/docs/clubs',
            },
            {
              label: '山商MC煤炭社',
              to: '/docs/clubs/mc-coal',
            },
            {
              label: '电脑技术协会',
              to: '/docs/clubs/computer-tech',
            },
          ],
        },
        {
          title: '参与单位',
          items: [
            {
              label: 'X动漫联盟协会',
              to: '/docs/clubs/x-anime',
            },
            {
              label: '山商视觉摄影协会',
              to: '/docs/clubs/photography',
            },
            {
              label: '516轮滑协会',
              to: '/docs/clubs/skate-516',
            },
            {
              label: '轩辕文学社',
              to: '/docs/clubs/xuanyuan-literature',
            },
            {
              label: '山商魔术社',
              to: '/docs/clubs/magic',
            },
          ],
        },
        {
          title: '关于',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/MyGOClubParty/club-party-website',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} MyGOClubParty.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
