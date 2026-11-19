/**
 * A class as the DataModel panel's Explorer draws it: its class icon where it
 * has one, otherwise the Explorer's own glyph for a service, a script, a
 * folder or a model. Shared by every picker that lists instances or services,
 * so a service reads the same in Add Service and on Get Service's node.
 */

import { wearsClassIcon } from "../core/classIcons.js";
import { classGlyph } from "../core/rbx/browse.js";
import { ClassIcon } from "./ClassIcon.jsx";
import { cx } from "./cx.js";
import { Icon, type IconName } from "./icons.jsx";

export function ExplorerIcon({
	className,
	service,
	open,
	size = 15,
}: {
	className: string;
	service: boolean;
	open: boolean;
	size?: number;
}) {
	if (wearsClassIcon(className)) return <ClassIcon name={className} size={size} />;
	const { icon, tone } = classGlyph(className, service, open);
	return <Icon name={icon as IconName} size={size} className={cx("kind", tone)} />;
}
