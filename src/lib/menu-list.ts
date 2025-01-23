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
          href: '/articles',
          label: 'Articles',
          active: pathname.includes('/articles'),
          icon: BookMarked,
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
      groupLabel: 'Frontend',
      menus: [
        { href: '/front/react', label: 'React', active: pathname.includes('/front/react'), icon: LayoutGrid, submenus: [] },
        { href: '/front/css', label: 'CSS', active: pathname.includes('/front/css'), icon: Tag, submenus: [] },
        { href: '/front/js',
          label: 'JavaScript',
          active: pathname.includes('/front/css'),
          icon: Tag,
          submenus: [
            {
              href: '/js/algorithm',
              label: 'Algorithm',
              active: pathname === '/js/algorithm',
            },
            {
              href: '/twl',
              label: 'Today I Learned',
              active: pathname === '/twl',
            },
          ],
        },
      ],
    },
    {
      groupLabel: 'Develop',
      menus: [
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
