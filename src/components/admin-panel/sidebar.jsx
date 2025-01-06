import { cn } from '@/lib/utils';
import { Menu } from '@components/admin-panel/menu';
import { SidebarToggle } from '@components/admin-panel/sidebar-toggle';
import { useAppDispatch, useAppSelector } from '@/hooks/reduxHooks';
import { toggleSidebar } from '@store/sidebarSlice';
import { Button } from '@shadcn/button';
import Link from 'next/link';
import { PanelsTopLeft, Boxes } from 'lucide-react';

export function Sidebar() {
  const sidebar = useAppSelector((state) => state.sidebar?.isOpen);
  const dispatch = useAppDispatch();

  const handleToggle = () => {
    dispatch(toggleSidebar(!sidebar));
  };

  return (
    <aside
      className={cn(
        'fixed top-0 left-0 z-[30] h-screen -translate-x-full lg:translate-x-0 transition-[width] ease-in-out duration-300 bg-white',
        sidebar === false ? 'w-[90px]' : 'w-72',
      )}
    >
      <div className='flex-shrink-0'>
        <SidebarToggle isOpen={sidebar} setIsOpen={handleToggle} />
        <div className='relative h-full flex flex-col px-3 py-10 overflow-y-auto shadow-md dark:shadow-zinc-800'>
          <Button
            className={cn(
              'transition-transform ease-in-out duration-300 mb-1',
              sidebar === false ? 'translate-x-1' : 'translate-x-0',
            )}
            variant='link'
            asChild
          >
            <Link href='/' className='flex items-center gap-2'>
              <PanelsTopLeft className='w-6 h-6 mr-1' />
              <h1
                className={cn(
                  'font-bold text-2xl whitespace-nowrap transition-[transform,opacity,display] ease-in-out duration-300',
                  sidebar === false ? '-translate-x-96 opacity-0 hidden' : 'translate-x-0 opacity-100',
                )}
              >
                Trond Blog
              </h1>
            </Link>
          </Button>
          <Menu isOpen={sidebar} />
        </div>
      </div>
    </aside>
  );
}
