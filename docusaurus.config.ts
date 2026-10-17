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
    // 顶栏公告（Docusaurus 自带，渲染在导航栏**上方**的 `role="banner"` 条）。
    // - `content` 走 dangerouslySetInnerHTML，可以直接写文字与 emoji。
    // - **不在这里写 backgroundColor / textColor**：那两个值会以内联样式落在元素上，
    //   两个主题共用一套颜色，深色页面会突兀。配色改在 src/css/custom.css 里按
    //   `html[data-theme]` 分主题给（容器类 `.theme-announcement-bar` 是稳定类名）。
    // - `id` 是「这条公告是不是新的一条」的判据（存在 localStorage）：**改文案就要换 id**。
    //   这条设了 `isCloseable: false`（关不掉），后缀 `-noclose` 的由来见下。
    announcementBar: {
      // `isActive` = 「配置里有公告」**且**「本机那个 dismiss 键不是 true」，而 Docusaurus
      // 只在 id 变化时才清那个键（announcementBar.js 的 isNewAnnouncement）。所以只要是
      // **点过 × 的浏览器**，id 不变就永远看不到这条通知 —— 改成 isCloseable:false 也救不回来
      // （开关只管「有没有 × 可点」，不管「显示不显示」）。带 `-noclose` 后缀是防御性的：
      // 预览环境里已经点过 × 的同学属于这类，将来若先上线过可关闭版再改成不可关闭，同样靠它复位。
      id: 'beta-data-wipe-2026-10-17-noclose',
      content:
        '⚠️ 公测期间所有功能仅供测试，10月17日正式开始报名前将清空所有测试期间的报名数据！',
      // 这条通知必须一直看得见（清库时间点），不给关闭入口。
      isCloseable: false,
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
