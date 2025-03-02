import AdminPanelLayout from "@components/admin-panel/admin-panel-layout";
import React from "react";
import Header from "@components/Header";

const Layout = ({ children }) => {
  return (
    <div className="layout">
      <AdminPanelLayout>{children}</AdminPanelLayout>
    </div>
  );
};

export default Layout;
