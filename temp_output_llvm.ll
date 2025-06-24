; Standard library functions
declare i32 @printf(i8*, ...)
declare i32 @scanf(i8*, ...)
declare i8* @malloc(i64)
declare void @free(i8*)
declare i32 @puts(i8*)


define i32 @main() {
entry:
  %0 = add i32 22, 25
  %1 = getelementptr inbounds [4 x i8], [4 x i8]* @.str.0, i64 0, i64 0
  call i32 (i8*, ...) @printf(i8* %1, i32 %0)
  ret i32 0
}

; String constants
@.str.0 = private unnamed_addr constant [5 x i8] c"%d\5Cn\00", align 1