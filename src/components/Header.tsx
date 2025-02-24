import React from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import Link from "next/link";

function Header() {
  return (
    <header className="flex justify-center items-center h-16 bg-gray-800 text-white">
      <nav className="flex items-center justify-end w-full max-w-7xl p-4 mx-auto">
        <ul className="flex items-center space-x-4">
          <li className="flex items-center">
            <Link href={"/"}>
              <h1 className="flex items-center leading-none">Home</h1>
            </Link>
          </li>
          <li className="flex items-center">
            <Link href={"/about"}>
              <h1 className="flex items-center leading-none">About</h1>
            </Link>
          </li>
          <li className="flex items-center hover:text-blue-500">
            <div className="flex items-center space-x-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Avatar className="h-8 w-8 cursor-pointer">
                    <AvatarImage src="/profile.jpeg" />
                    <AvatarFallback>CN</AvatarFallback>
                  </Avatar>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56">
                  <>
                    <DropdownMenuLabel>My Account</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <DropdownMenuItem>Profile</DropdownMenuItem>
                      <DropdownMenuItem>Billing</DropdownMenuItem>
                      <DropdownMenuItem>Settings</DropdownMenuItem>
                      <DropdownMenuItem>Log out</DropdownMenuItem>
                    </DropdownMenuGroup>
                  </>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </li>
        </ul>
      </nav>
    </header>
  );
}

export default Header;
