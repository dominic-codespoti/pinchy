"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useSkillDetail, useUpdateSkill } from "../hooks";

const formSchema = z.object({
  description: z.string().min(1, "Description is required"),
  instructions: z.string().min(1, "Instructions are required"),
});

type FormData = z.infer<typeof formSchema>;

interface EditSkillDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  skillId: string;
}

export function EditSkillDialog({
  open,
  onOpenChange,
  skillId,
}: EditSkillDialogProps) {
  const { data: skill, isLoading } = useSkillDetail(skillId);
  const updateSkill = useUpdateSkill();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      description: "",
      instructions: "",
    },
  });

  // Pre-populate form when skill data loads
  useEffect(() => {
    if (skill) {
      form.reset({
        description: skill.description || "",
        instructions: skill.instructions || "",
      });
    }
  }, [skill, form]);

  const onSubmit = async (data: FormData) => {
    await updateSkill.mutateAsync({
      skillName: skillId,
      updates: {
        description: data.description,
        instructions: data.instructions,
      },
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Edit Skill: {skillId}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="py-4 text-sm text-muted-foreground">
            Loading skill details...
          </div>
        ) : (
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-4 py-4"
            >
              <FormItem>
                <FormLabel>Skill ID</FormLabel>
                <FormControl>
                  <Input value={skillId} disabled />
                </FormControl>
              </FormItem>

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Input placeholder="What this skill does..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="instructions"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Instructions (Markdown)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Enter skill instructions in Markdown format..."
                        rows={10}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={updateSkill.isPending}>
                  {updateSkill.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}

EditSkillDialog.displayName = "EditSkillDialog";
