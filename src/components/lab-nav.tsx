"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { logoutAction } from "@/server/actions";

type LabLink = { href: string; label: string; group: "primary" | "floor" | "office" };

const sections = [
  { group: "primary", title: "Desk" },
  { group: "floor", title: "Daily" },
  { group: "office", title: "Office" },
] as const;

export function LabChrome({
  links,
  name,
  role,
}: {
  links: LabLink[];
  name: string;
  role: string;
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [more, setMore] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const active = links
    .filter((link) => (link.href === "/" ? path === "/" : path === link.href || path.startsWith(`${link.href}/`)))
    .sort((left, right) => right.href.length - left.href.length)[0]?.href;
  const primary = links.filter((link) => link.group === "primary");
  const extra = links.filter((link) => link.group !== "primary");
  const grouped = sections
    .map((section) => ({ ...section, links: links.filter((link) => link.group === section.group) }))
    .filter((section) => section.links.length > 0);
  const extraGroups = grouped.filter((section) => section.group !== "primary");

  useEffect(() => {
    setOpen(false);
    setMore(false);
  }, [path]);

  useEffect(() => {
    if (!open && !more) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        setMore(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, more]);

  useEffect(() => {
    if (!more) return;
    const onPointer = (event: PointerEvent) => {
      if (!moreRef.current?.contains(event.target as Node)) setMore(false);
    };
    window.addEventListener("pointerdown", onPointer);
    return () => window.removeEventListener("pointerdown", onPointer);
  }, [more]);

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
            {primary.map((link) => (
              <Link key={link.href} href={link.href} prefetch className={link.href === active ? "is-active" : undefined}>
                {link.label}
              </Link>
            ))}
            {extra.length > 0 ? (
              <div className="lab-more" ref={moreRef}>
                <button
                  type="button"
                  className={extra.some((link) => link.href === active) || more ? "is-active" : undefined}
                  aria-expanded={more}
                  aria-controls="lab-more"
                  onClick={() => setMore((value) => !value)}
                >
                  More
                </button>
                {more ? (
                  <div id="lab-more" className="lab-more-panel" role="menu">
                    {extraGroups.map((section) => (
                      <div key={section.group}>
                        <p>{section.title}</p>
                        {section.links.map((link) => (
                          <Link key={link.href} href={link.href} prefetch className={link.href === active ? "is-active" : undefined} role="menuitem">
                            {link.label}
                          </Link>
                        ))}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
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
            {grouped.map((section) => (
              <div key={section.group} className="lab-drawer-group">
                <p>{section.title}</p>
                {section.links.map((link) => (
                  <Link key={link.href} href={link.href} prefetch className={link.href === active ? "is-active" : undefined}>
                    {link.label}
                  </Link>
                ))}
              </div>
            ))}
          </nav>
        </div>
      </div>
    </header>
  );
}
