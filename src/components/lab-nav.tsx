"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { logoutAction } from "@/server/actions";

export function LabChrome({
  links,
  name,
  role,
}: {
  links: { href: string; label: string }[];
  name: string;
  role: string;
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const active = links
    .filter((link) => (link.href === "/" ? path === "/" : path === link.href || path.startsWith(`${link.href}/`)))
    .sort((left, right) => right.href.length - left.href.length)[0]?.href;

  useEffect(() => {
    setOpen(false);
  }, [path]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="lab-bar">
      <div className="lab-bar-inner">
        <Link href="/" className="lab-brand">
          <span className="lab-mark" aria-hidden="true">Z</span>
          <span>
            <span className="lab-logo">ZANN</span>
            <span className="lab-brand-sub">Laboratory</span>
          </span>
        </Link>
        <div className="lab-nav-wrap">
          <nav className="lab-nav" aria-label="Laboratory">
            {links.map((link) => (
              <Link key={link.href} href={link.href} className={link.href === active ? "is-active" : undefined}>
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="lab-who">
          <div className="lab-who-copy">
            <p className="lab-who-name">{name}</p>
            <p className="lab-who-role">{role}</p>
          </div>
          <form action={logoutAction}>
            <button className="lab-signout">Sign out</button>
          </form>
          <button
            type="button"
            className={open ? "lab-menu is-open" : "lab-menu"}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="lab-drawer"
            onClick={() => setOpen((value) => !value)}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </div>
      <div id="lab-drawer" className={open ? "lab-drawer is-open" : "lab-drawer"} inert={open ? undefined : true}>
        <div className="lab-drawer-inner">
          <p className="lab-drawer-who">{name}</p>
          <p className="lab-drawer-role">{role}</p>
          <nav aria-label="Laboratory">
            {links.map((link) => (
              <Link key={link.href} href={link.href} className={link.href === active ? "is-active" : undefined}>
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </header>
  );
}
