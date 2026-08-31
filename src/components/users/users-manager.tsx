"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontalIcon, PencilIcon, PlusIcon, ShieldCheckIcon, ShieldOffIcon, UserRoundIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import type { UserDto } from "@/services/identity.service";
import {
  activateUserAction,
  deactivateUserAction,
} from "@/actions/user-actions";
import { toast } from "sonner";
import { CreateUserForm, EditUserForm, type RoleOption } from "@/components/users/user-forms";
import { cn } from "@/lib/utils";

type DialogState = { kind: "create" } | { kind: "edit"; user: UserDto } | null;

export function UsersManager({
  users,
  roles,
  currentUserId,
}: {
  users: UserDto[];
  roles: RoleOption[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogState>(null);

  const refresh = () => {
    setDialog(null);
    router.refresh();
  };

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-xl font-bold">المستخدمون</h1>
          <p className="text-sm text-muted-foreground">
            إدارة حسابات المستخدمين وأدوارهم وصلاحياتهم
          </p>
        </div>
        <Button onClick={() => setDialog({ kind: "create" })}>
          <PlusIcon className="size-4" aria-hidden />
          مستخدم جديد
        </Button>
      </div>

      <div className="rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>الاسم</TableHead>
              <TableHead>اسم المستخدم</TableHead>
              <TableHead>الدور</TableHead>
              <TableHead>الحالة</TableHead>
              <TableHead className="text-end">إجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  لا يوجد مستخدمون
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => (
                <UserRow
                  key={user.id}
                  user={user}
                  roles={roles}
                  isCurrentUser={user.id === currentUserId}
                  onEdit={() => setDialog({ kind: "edit", user })}
                  onChanged={refresh}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={dialog?.kind === "create"}
        onOpenChange={(open) => setDialog(open ? { kind: "create" } : null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إنشاء مستخدم جديد</DialogTitle>
            <DialogDescription>
              حدد بيانات الحساب والدور الخاص به
            </DialogDescription>
          </DialogHeader>
          {dialog?.kind === "create" ? (
            <CreateUserForm roles={roles} onSuccess={refresh} />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={dialog?.kind === "edit"}
        onOpenChange={(open) => setDialog(open && dialog?.kind === "edit" ? dialog : null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تعديل المستخدم</DialogTitle>
            <DialogDescription>
              تحديث بيانات الحساب والدور
            </DialogDescription>
          </DialogHeader>
          {dialog?.kind === "edit" ? (
            <EditUserForm
              user={dialog.user}
              roles={roles}
              onSuccess={refresh}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function UserRow({
  user,
  roles,
  isCurrentUser,
  onEdit,
  onChanged,
}: {
  user: UserDto;
  roles: RoleOption[];
  isCurrentUser: boolean;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const [pendingAction, startTransition] = useTransition();
  const role = roles.find((r) => r.id === user.roleId);

  const toggleActive = () => {
    startTransition(async () => {
      const action = user.active ? deactivateUserAction : activateUserAction;
      const successMessage = user.active ? "تم تعطيل الحساب" : "تم تفعيل الحساب";
      const result = await action(user.id);
      if (result.success) {
        toast.success(successMessage);
        onChanged();
      } else if (result.error) {
        toast.error(result.error);
      }
    });
  };

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
            <UserRoundIcon className="size-4 text-muted-foreground" aria-hidden />
          </span>
          <span className="font-medium">
            {user.name}
            {isCurrentUser ? (
              <span className="ms-2 text-xs text-muted-foreground">(أنت)</span>
            ) : null}
          </span>
        </div>
      </TableCell>
      <TableCell dir="ltr" className="text-start text-muted-foreground">
        {user.username}
      </TableCell>
      <TableCell>{role?.label ?? user.roleName ?? "—"}</TableCell>
      <TableCell>
        <StatusBadge active={user.active} />
      </TableCell>
      <TableCell className="text-end">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon-sm" />}
            aria-label={`إجراءات ${user.name}`}
          >
            <MoreHorizontalIcon className="size-4" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onEdit}>
              <PencilIcon className="size-4" aria-hidden />
              تعديل
            </DropdownMenuItem>
            {user.isOwner ? null : (
              <DropdownMenuItem
                onSelect={() => {
                  if (!user.active || !isCurrentUser) toggleActive();
                }}
                disabled={isCurrentUser || pendingAction}
              >
                {user.active ? (
                  <>
                    <ShieldOffIcon className="size-4" aria-hidden />
                    تعطيل الحساب
                  </>
                ) : (
                  <>
                    <ShieldCheckIcon className="size-4" aria-hidden />
                    تفعيل الحساب
                  </>
                )}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        active
          ? "bg-emerald-100 text-emerald-700"
          : "bg-zinc-100 text-zinc-600",
      )}
    >
      {active ? "نشط" : "معطل"}
    </span>
  );
}
