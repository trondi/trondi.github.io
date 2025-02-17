import '@/styles/globals.css';
import type { AppProps } from 'next/app';
import { persistor, store, wrapper } from '@store/index';
import Layout from '@components/Layout';
import {Provider} from "react-redux";
import {PersistGate} from "redux-persist/integration/react";
import {Avatar, AvatarFallback, AvatarImage} from "@shadcn/avatar";
import {
    DropdownMenu, DropdownMenuContent,
    DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuPortal, DropdownMenuSeparator,
    DropdownMenuShortcut, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger
} from "@shadcn/dropdown-menu";
import { Button } from '@shadcn/button';

export default function App({ Component, pageProps }: AppProps) {
  return (
      <Provider store={store}>
          <PersistGate persistor={persistor} loading={null}>
              <Layout>
                  <header className="flex justify-center items-center h-16 bg-gray-800 text-white">
                      <nav className="flex items-center justify-end w-full max-w-7xl p-4 mx-auto">
                          <ul className="flex items-center space-x-4">
                              <li className="flex items-center">
                                  <a className="flex items-center leading-none" href="/">
                                      Home
                                  </a>
                              </li>
                              <li className="flex items-center">
                                  <a className="flex items-center leading-none" href="/about">
                                      About
                                  </a>
                              </li>
                              <li className="flex items-center hover:text-blue-500">
                                  <div className="flex items-center space-x-2">

                                      <DropdownMenu>
                                          <DropdownMenuTrigger asChild>
                                              <Avatar className="h-8 w-8">
                                                  <AvatarImage src='/profile.jpeg' />
                                                  <AvatarFallback>CN</AvatarFallback>
                                              </Avatar>
                                          </DropdownMenuTrigger>
                                          <DropdownMenuContent className="w-56">
                                              <DropdownMenuLabel>My Account</DropdownMenuLabel>
                                              <DropdownMenuSeparator />
                                              <DropdownMenuGroup>
                                                  <DropdownMenuItem>
                                                      Profile
                                                      <DropdownMenuShortcut>⇧⌘P</DropdownMenuShortcut>
                                                  </DropdownMenuItem>
                                                  <DropdownMenuItem>
                                                      Billing
                                                      <DropdownMenuShortcut>⌘B</DropdownMenuShortcut>
                                                  </DropdownMenuItem>
                                                  <DropdownMenuItem>
                                                      Settings
                                                      <DropdownMenuShortcut>⌘S</DropdownMenuShortcut>
                                                  </DropdownMenuItem>
                                                  <DropdownMenuItem>
                                                      Keyboard shortcuts
                                                      <DropdownMenuShortcut>⌘K</DropdownMenuShortcut>
                                                  </DropdownMenuItem>
                                              </DropdownMenuGroup>
                                              <DropdownMenuSeparator />
                                              <DropdownMenuGroup>
                                                  <DropdownMenuItem>Team</DropdownMenuItem>
                                                  <DropdownMenuSub>
                                                      <DropdownMenuSubTrigger>Invite users</DropdownMenuSubTrigger>
                                                      <DropdownMenuPortal>
                                                          <DropdownMenuSubContent>
                                                              <DropdownMenuItem>Email</DropdownMenuItem>
                                                              <DropdownMenuItem>Message</DropdownMenuItem>
                                                              <DropdownMenuSeparator />
                                                              <DropdownMenuItem>More...</DropdownMenuItem>
                                                          </DropdownMenuSubContent>
                                                      </DropdownMenuPortal>
                                                  </DropdownMenuSub>
                                                  <DropdownMenuItem>
                                                      New Team
                                                      <DropdownMenuShortcut>⌘+T</DropdownMenuShortcut>
                                                  </DropdownMenuItem>
                                              </DropdownMenuGroup>
                                              <DropdownMenuSeparator />
                                              <DropdownMenuItem>GitHub</DropdownMenuItem>
                                              <DropdownMenuItem>Support</DropdownMenuItem>
                                              <DropdownMenuItem disabled>API</DropdownMenuItem>
                                              <DropdownMenuSeparator />
                                              <DropdownMenuItem>
                                                  Log out
                                                  <DropdownMenuShortcut>⇧⌘Q</DropdownMenuShortcut>
                                              </DropdownMenuItem>
                                          </DropdownMenuContent>
                                      </DropdownMenu>
                                  </div>
                              </li>
                          </ul>
                      </nav>
                  </header>

                  <Component {...pageProps} />
              </Layout>
          </PersistGate>
      </Provider>
  )
}
