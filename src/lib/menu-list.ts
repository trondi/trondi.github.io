import {
  Tag,
  Users,
  Settings,
  Bookmark,
  SquarePen,
  LayoutGrid,
  LucideIcon,
  Building,
  Award,
  Box,
  LibraryBig,
  BookMarked,
  UserCog,
} from 'lucide-react';

type Submenu = {
  href: string;
  label: string;
  active: boolean;
};

type Menu = {
  href: string;
  label: string;
  active: boolean;
  icon: LucideIcon;
  submenus: Submenu[];
};

type Group = {
  groupLabel: string;
  menus: Menu[];
};

export function getMenuList(pathname: string): Group[] {
  return [
    {
      groupLabel: '',
      menus: [
        {
          href: '/javascript',
          label: 'Javascript',
          active: pathname.includes('/javascript'),
          icon: LayoutGrid,
          submenus: [],
        },
        {
          href: '/develop',
          label: 'Develop',
          active: pathname.includes('/develop'),
          icon: BookMarked,
          submenus: [
            {
              href: '/document/list',
              label: 'List',
              active: pathname === '/document/list',
            },
            {
              href: '/document/library',
              label: 'Library Documents',
              active: pathname === '/document/library',
            },
          ],
        },
      ],
    },
    {
      groupLabel: 'Settings',
      menus: [
        {
          href: '/test-ui',
          label: 'Test Components',
          active: pathname.includes('/test-ui'),
          icon: LayoutGrid,
          submenus: [],
        },
        {
          href: '/users',
          label: 'Users',
          active: pathname.includes('/users'),
          icon: Users,
          submenus: [],
        },
        {
          href: '/account',
          label: 'Account',
          active: pathname.includes('/account'),
          icon: Settings,
          submenus: [],
        },
      ],
    },
  ];
}
