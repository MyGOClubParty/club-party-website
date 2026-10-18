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
  url: 'https://clubparty.iicemeta.com',
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
        // 有几个页面**不该被搜索引擎收**，从 sitemap 里排掉：
        //   - `/admin`：报名后台（robots.txt 也 Disallow 了），它只是给管理员用的表单；
        //   - `/showcase`：组件演示页，用来核 minecraft-react-ui 的渲染，导航里没有入口，
        //     对读者没有意义 —— 但它仍然可以访问（本地调库时要用）。
        sitemap: {
          ignorePatterns: ['/admin', '/showcase'],
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    // Replace with your project's social card
    image: 'img/social-card.png',
    colorMode: {
      respectPrefersColorScheme: true,
    },
    // 顶栏公告（Docusaurus 自带，渲染在导航栏**上方**的 `role="banner"` 条）—— **当前关闭**。
    // 关的原因是内容过期：那条「10 月 17 日清空测试数据」的通知到了 10 月 18 日还挂着，
    // 只会让人以为正式报名还没开始。关闭方式是**把 `announcementBar` 整个去掉** ——
    // Docusaurus 的 `isActive` 是内部算出来的（配置里存在这个键 = 有公告，且本机 dismiss
    // 键不为 true），没有 `isActive: false` 这种字段，写上反而校验不过。
    //
    // 将来要挂新通知，从 git 历史取回本段（`bb3cb3a` 之前的版本），注意两点：
    //   - **改文案必须同时换 `id`**：点过 × 的浏览器本机留着 dismiss=true，id 不变就永远
    //     看不到这条（`isCloseable: false` 也救不回来 —— 那个开关只管有没有 × 可点）。
    //   - 配色别写在配置里（`backgroundColor`/`textColor` 会以内联样式盖掉两套主题）。
    //     按主题给的配色还在 src/css/custom.css 的 `html[data-theme] .theme-announcement-bar`，
    //     没跟着删，恢复公告时直接生效。
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
        // 报名与名单是这次活动真正要人动手的两页，放在左侧最右
        {to: '/signup', label: '活动报名', position: 'left'},
        {to: '/participants', label: '小伙伴们', position: 'left'},
        // 右侧按数组顺序从左往右排：「关于」在 GitHub 左边
        {to: '/about', label: '关于', position: 'right'},
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
        // 「关于」栏已撤掉：关于本站进了导航栏，仓库链接由下面的 Source Codes 按钮承担，
        // 而那个按钮指向的正是原来这一栏的 GitHub 地址，没有信息损失。
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
